const path = require('path');
const crypto = require('crypto');
const { loadIndex, normalizeName, tokenDisagreement, verifyCandidate } = require('../../recovery/discover_tfrrs_candidates');
const { ensureIngestDatabaseUrl } = require('../../shared/private_database_url');

const INDEX_PATH = path.join(__dirname, '../../tfrrs-meet-index.json');
const DEFAULT_SCOPE = 'outdoor-2026-4x100-source-reconciliation-v1';
const DEFAULT_DELAY_MS = 400;
const NAME_STOP_WORDS = new Set([
  'invitational', 'invite', 'open', 'classic', 'championships', 'championship',
  'meet', 'track', 'field', 'university', 'college', 'the', 'of', 'and', 'at',
  'vs', 'collegiate',
]);

function parseArgs(argv = process.argv.slice(2)) {
  const value = flag => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  const limit = value('--limit') == null ? 0 : Number(value('--limit'));
  const delayMs = value('--delay-ms') == null ? DEFAULT_DELAY_MS : Number(value('--delay-ms'));
  if (!Number.isInteger(limit) || limit < 0) throw new Error('--limit must be a non-negative integer');
  if (!Number.isInteger(delayMs) || delayMs < 0) throw new Error('--delay-ms must be a non-negative integer');
  return {
    scope: value('--scope') || DEFAULT_SCOPE,
    limit,
    delayMs,
    stage: argv.includes('--stage'),
  };
}

function candidateFingerprint(rows) {
  return crypto.createHash('md5')
    .update(rows.map(row => `${row.meet_id}:${row.url}`).sort().join(','))
    .digest('hex');
}

function identifyingTokens(value) {
  return normalizeName(value)
    .split(' ')
    .filter(token => token && !NAME_STOP_WORDS.has(token));
}

function selectCandidate(meetName, index) {
  const exact = index.get(normalizeName(meetName)) || [];
  if (exact.length === 1 && !tokenDisagreement(meetName, exact[0].name).length) {
    return { status: 'candidate', candidate: exact[0], method: 'exact_normalized_name' };
  }
  if (exact.length > 1) return { status: 'ambiguous', candidates: exact };

  const meetTokens = new Set(identifyingTokens(meetName));
  if (!meetTokens.size) return { status: 'no_candidate', candidates: [] };
  const candidates = [...index.values()].flat().filter(candidate => {
    const candidateTokens = new Set(identifyingTokens(candidate.name));
    if (!candidateTokens.size) return false;
    let shared = 0;
    for (const token of meetTokens) if (candidateTokens.has(token)) shared += 1;
    return shared === Math.min(meetTokens.size, candidateTokens.size);
  }).map(candidate => ({
    candidate,
    shared: identifyingTokens(meetName).filter(token => identifyingTokens(candidate.name).includes(token)).length,
  }));
  if (!candidates.length) return { status: 'no_candidate', candidates: [] };
  const mostSpecific = Math.max(...candidates.map(row => row.shared));
  const best = candidates.filter(row => row.shared === mostSpecific).map(row => row.candidate);
  const uniqueUrls = new Map(best.map(candidate => [candidate.url, candidate]));
  if (uniqueUrls.size !== 1) return { status: 'ambiguous', candidates: [...uniqueUrls.values()] };
  return { status: 'candidate', candidate: [...uniqueUrls.values()][0], method: 'contained_identifying_tokens' };
}

function holdMultiplyClaimedUrls(rows) {
  const claimCounts = new Map();
  for (const row of rows) claimCounts.set(row.url, (claimCounts.get(row.url) || 0) + 1);
  return {
    eligible: rows.filter(row => claimCounts.get(row.url) === 1),
    held: rows.filter(row => claimCounts.get(row.url) > 1),
  };
}

async function discover({ pool, scope = DEFAULT_SCOPE, indexPath = INDEX_PATH, limit = 0, delayMs = DEFAULT_DELAY_MS, stage = false } = {}) {
  const index = loadIndex(indexPath);
  const { rows } = await pool.query(`
    SELECT q.job_id, q.meet_id, m.name, m.date::text AS date
      FROM ingest.event_recovery_queue q
      JOIN public.meets m USING (meet_id)
     WHERE q.scope_key = $1
       AND q.status = 'blocked'
       AND m.tfrrs_url IS NULL
       AND COALESCE(q.source_candidates #>> '{reconciliation,tfrrs_candidate,url}', '') = ''
     ORDER BY m.date, m.meet_id
     ${limit ? 'LIMIT $2' : ''}
  `, limit ? [scope, limit] : [scope]);

  const verified = [];
  let ambiguous = 0;
  let noCandidate = 0;
  let rejected = 0;
  for (const meet of rows) {
    const selection = selectCandidate(meet.name, index);
    if (selection.status === 'no_candidate') {
      noCandidate++;
      continue;
    }
    if (selection.status === 'ambiguous') {
      ambiguous++;
      continue;
    }
    const candidate = selection.candidate;
    const verification = await verifyCandidate(candidate, meet);
    if (verification.status !== 'verified') {
      rejected++;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }
    verified.push({
      ...meet,
      url: candidate.url,
      candidate_name: candidate.name,
      verification: { ...verification, candidate_method: selection.method },
    });
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  const claims = holdMultiplyClaimedUrls(verified);
  let contested = claims.held.length;
  verified.length = 0;
  verified.push(...claims.eligible);

  let ownedConflict = 0;
  if (verified.length) {
    const urls = [...new Set(verified.map(row => row.url))];
    const { rows: owners } = await pool.query(
      `SELECT meet_id, tfrrs_url FROM public.meets WHERE tfrrs_url = ANY($1::text[])`,
      [urls]
    );
    const owned = new Set(owners.map(row => `${row.meet_id}:${row.tfrrs_url}`));
    const eligible = verified.filter(row => {
      const conflict = owners.some(owner => owner.tfrrs_url === row.url && owner.meet_id !== row.meet_id);
      if (conflict) ownedConflict += 1;
      return !conflict && !owned.has(`${row.meet_id}:${row.url}`);
    });
    verified.length = 0;
    verified.push(...eligible);
  }

  if (stage && verified.length) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of verified) {
        const payload = {
          url: row.url,
          candidate_name: row.candidate_name,
          method: `${row.verification.candidate_method}+${row.verification.method}`,
          verified_date: row.date,
          verified_at: row.verification.verified_at,
        };
        const updated = await client.query(`
          UPDATE ingest.event_recovery_queue q
             SET source_candidates = jsonb_set(
               COALESCE(source_candidates, '{}'::jsonb),
               '{reconciliation}',
               COALESCE(source_candidates->'reconciliation', '{}'::jsonb)
                 || jsonb_build_object('tfrrs_candidate', $3::jsonb),
               true
             ),
                 updated_at = now()
           WHERE q.scope_key = $1
             AND job_id = $2
             AND q.status = 'blocked'
             AND EXISTS (
               SELECT 1 FROM public.meets m
                WHERE m.meet_id = q.meet_id
                  AND m.tfrrs_url IS NULL
             )
        `, [scope, row.job_id, JSON.stringify(payload)]);
        if (updated.rowCount !== 1) throw new Error(`candidate staging lost job ${row.job_id}`);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    scope,
    selected: rows.length,
    verified: verified.length,
    rejected,
    ambiguous,
    noCandidate,
    contested,
    ownedConflict,
    staged: stage ? verified.length : 0,
    fingerprint: candidateFingerprint(verified),
    samples: verified.slice(0, 20).map(row => ({ meet_id: row.meet_id, name: row.name, date: row.date, url: row.url })),
  };
}

module.exports = {
  DEFAULT_SCOPE,
  DEFAULT_DELAY_MS,
  INDEX_PATH,
  candidateFingerprint,
  discover,
  holdMultiplyClaimedUrls,
  identifyingTokens,
  parseArgs,
  selectCandidate,
};

if (require.main === module) {
  const { Pool } = require('pg');
  require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
  const args = parseArgs();
  const env = process.env;
  ensureIngestDatabaseUrl(env);
  const connectionString = env.INGEST_DATABASE_URL;
  if (!connectionString) throw new Error('INGEST_DATABASE_URL or DATABASE_URL is required');
  const pool = new Pool({ connectionString, ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }, max: 2 });
  discover({ pool, ...args })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(`TFRRS source discovery failed: ${error.message}`); process.exitCode = 1; })
    .finally(() => pool.end());
}
