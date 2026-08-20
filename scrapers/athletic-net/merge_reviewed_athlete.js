#!/usr/bin/env node
/**
 * Merge one explicitly reviewed duplicate athlete into its canonical identity.
 *
 * This is intentionally narrow and write-protected. It backs up duplicate result rows, moves
 * unique result rows, rewires private provenance, removes only the exact duplicate result rows,
 * transfers the verified Athletic.net profile URL, deactivates the old athlete, and records the
 * source-profile alias. It never guesses a target from a name alone.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { normaliseMarkKey } = require('../shared/result_fingerprint');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_MANIFEST = path.join(__dirname, 'athlete-merge-decisions.json');

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  return {
    manifest: valueAfter(argv, '--manifest') || DEFAULT_MANIFEST,
    commit: argv.includes('--commit'),
  };
}

function normalizeName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function namesCompatible(oldName, targetName) {
  const oldValue = normalizeName(oldName);
  const targetValue = normalizeName(targetName);
  return Boolean(oldValue && targetValue && (
    oldValue === targetValue || oldValue.endsWith(` ${targetValue}`) || targetValue.endsWith(` ${oldValue}`)
  ));
}

function profileUrl(profileId) {
  return `https://www.athletic.net/athlete/${String(profileId).trim()}/track-and-field`;
}

function resultKey(row) {
  return [row.meet_id || '', row.event_type_id || '', normaliseMarkKey(row.mark_raw), row.place || ''].join('|');
}

function readManifest(filePath) {
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!manifest || manifest.manifest_version !== 1 || !Array.isArray(manifest.decisions)) {
    throw new Error('manifest must contain manifest_version: 1 and a decisions array');
  }
  if (manifest.decisions.length !== 1) throw new Error('athlete merge manifests must contain exactly one decision');
  const decision = manifest.decisions[0];
  for (const field of ['old_athlete_id', 'target_athlete_id', 'athletic_net_profile_id', 'source_athlete_key']) {
    if (!String(decision[field] || '').trim()) throw new Error(`merge decision missing ${field}`);
  }
  if (!Array.isArray(decision.duplicate_result_mappings)) {
    throw new Error('merge decision must include duplicate_result_mappings');
  }
  if (!Array.isArray(decision.evidence) || decision.evidence.length < 3) {
    throw new Error('merge decision requires at least three evidence items');
  }
  return manifest;
}

function buildPlan(decision, state) {
  const oldAthlete = state.athletes.find(row => Number(row.athlete_id) === Number(decision.old_athlete_id));
  const targetAthlete = state.athletes.find(row => Number(row.athlete_id) === Number(decision.target_athlete_id));
  const expectedUrl = profileUrl(decision.athletic_net_profile_id);
  const relayLegs = state.relayLegs || [];
  const targetRelayLegs = state.targetRelayLegs || [];
  const relayLegMappings = Array.isArray(decision.relay_leg_mappings) ? decision.relay_leg_mappings : [];
  const base = {
    old_athlete_id: Number(decision.old_athlete_id),
    target_athlete_id: Number(decision.target_athlete_id),
    source_athlete_key: String(decision.source_athlete_key).trim(),
    athletic_net_url: expectedUrl,
    evidence: decision.evidence,
    relay_leg_moves: [],
  };

  if (!oldAthlete || !targetAthlete) return { ...base, action: 'hold', reason: 'athlete_not_found' };
  if (base.old_athlete_id === base.target_athlete_id) return { ...base, action: 'hold', reason: 'same_athlete' };
  if (oldAthlete.gender !== targetAthlete.gender) return { ...base, action: 'hold', reason: 'gender_mismatch' };
  if (!namesCompatible(oldAthlete.full_name, targetAthlete.full_name)) {
    return { ...base, action: 'hold', reason: 'name_mismatch' };
  }
  if (String(oldAthlete.athletic_net_url || '').replace(/\/$/, '') !== expectedUrl) {
    return { ...base, action: 'hold', reason: 'old_profile_url_mismatch' };
  }
  if (targetAthlete.athletic_net_url && String(targetAthlete.athletic_net_url).replace(/\/$/, '') !== expectedUrl) {
    return { ...base, action: 'hold', reason: 'target_has_different_profile_url' };
  }
  if (state.profileOwners.filter(row => Number(row.athlete_id) !== base.old_athlete_id).length) {
    return { ...base, action: 'hold', reason: 'profile_url_has_other_owner' };
  }
  const unhandledDependencies = state.dependentCounts.filter(row => (
    Number(row.count) > 0 && row.dependency !== 'relay_legs'
  ));
  if (unhandledDependencies.length) {
    return { ...base, action: 'hold', reason: 'old_athlete_has_unhandled_dependencies', dependencies: unhandledDependencies };
  }
  if (relayLegs.length) {
    const mappedIds = relayLegMappings.map(mapping => Number(mapping.old_relay_athlete_id));
    const knownIds = relayLegs.map(row => Number(row.relay_athlete_id));
    if (relayLegMappings.length !== relayLegs.length
      || new Set(mappedIds).size !== mappedIds.length
      || knownIds.some(id => !mappedIds.includes(id))
      || relayLegMappings.some(mapping => mapping.action !== 'move')) {
      return { ...base, action: 'hold', reason: 'relay_legs_require_explicit_mapping', relay_legs: relayLegs };
    }
    const targetConflict = relayLegs.find(oldLeg => targetRelayLegs.some(targetLeg => (
      Number(targetLeg.relay_result_id) === Number(oldLeg.relay_result_id)
      && Number(targetLeg.leg_order || 0) === Number(oldLeg.leg_order || 0)
    )));
    if (targetConflict) {
      return { ...base, action: 'hold', reason: 'relay_leg_target_conflict', relay_leg: targetConflict };
    }
    base.relay_leg_moves = relayLegs.map(oldLeg => ({
      old_relay_athlete_id: Number(oldLeg.relay_athlete_id),
      relay_result_id: Number(oldLeg.relay_result_id),
      leg_order: oldLeg.leg_order == null ? null : Number(oldLeg.leg_order),
    }));
  }
  const oldById = new Map(state.results.map(row => [Number(row.result_id), row]));
  const targetById = new Map(state.targetResults.map(row => [Number(row.result_id), row]));
  const duplicateIds = new Set();
  const targetIds = new Set();
  for (const mapping of decision.duplicate_result_mappings) {
    const oldRow = oldById.get(Number(mapping.old_result_id));
    const targetRow = targetById.get(Number(mapping.target_result_id));
    if (!oldRow || !targetRow || resultKey(oldRow) !== resultKey(targetRow)) {
      return { ...base, action: 'hold', reason: 'duplicate_mapping_guard_failed', mapping };
    }
    duplicateIds.add(Number(mapping.old_result_id));
    targetIds.add(Number(mapping.target_result_id));
  }
  const moveIds = state.results.filter(row => !duplicateIds.has(Number(row.result_id))).map(row => Number(row.result_id));
  const duplicateSourceLinks = state.sourceLinks
    .filter(row => duplicateIds.has(Number(row.result_id)))
    .map(row => ({ result_id: Number(row.result_id), source_record_id: Number(row.source_record_id) }));
  const sourceRecordIds = duplicateSourceLinks.map(row => row.source_record_id);
  return {
    ...base,
    action: 'merge',
    reason: 'reviewed_duplicate_identity',
    move_result_ids: moveIds,
    delete_result_ids: [...duplicateIds],
    duplicate_target_result_ids: [...targetIds],
    duplicate_source_record_ids: sourceRecordIds,
    duplicate_source_links: duplicateSourceLinks,
    old_result_count: state.results.length,
    target_tfrrs_athlete_id: targetAthlete.tfrrs_athlete_id || null,
    target_athlete_name: targetAthlete.full_name,
  };
}

async function loadState(pool, decision) {
  const oldId = Number(decision.old_athlete_id);
  const targetId = Number(decision.target_athlete_id);
  const profile = profileUrl(decision.athletic_net_profile_id);
  const [athletes, results, targetResults, profileOwners, dependentCounts, relayLegs, targetRelayLegs] = await Promise.all([
    pool.query(
      `SELECT athlete_id, full_name, gender, school_id, athletic_net_url, tfrrs_athlete_id, is_active
         FROM public.athletes WHERE athlete_id = ANY($1::bigint[])`,
      [[oldId, targetId]]
    ),
    pool.query(
      `SELECT result_id, meet_id, event_type_id, mark_raw, place, round, athlete_id
         FROM public.results WHERE athlete_id = $1 ORDER BY result_id`, [oldId]
    ),
    pool.query(
      `SELECT result_id, meet_id, event_type_id, mark_raw, place, round, athlete_id
         FROM public.results WHERE athlete_id = $1 ORDER BY result_id`, [targetId]
    ),
    pool.query(
      `SELECT athlete_id, athletic_net_url FROM public.athletes WHERE athletic_net_url = $1`, [profile]
    ),
    pool.query(
      `SELECT 'relay_legs' AS dependency, count(*)::int AS count FROM public.relay_athletes WHERE athlete_id=$1
       UNION ALL SELECT 'athlete_prs', count(*)::int FROM public.athlete_prs WHERE athlete_id=$1
       UNION ALL SELECT 'team_seasons', count(*)::int FROM public.athlete_team_seasons WHERE athlete_id=$1
       UNION ALL SELECT 'live_results', count(*)::int FROM public.live_results WHERE athlete_id=$1
       UNION ALL SELECT 'unprocessed_live_results', count(*)::int FROM public.unprocessed_live_results WHERE athlete_id=$1
       UNION ALL SELECT 'external_ids', count(*)::int FROM public.external_ids WHERE athlete_id=$1`, [oldId]
    ),
    pool.query(
      `SELECT relay_athlete_id, relay_result_id, athlete_id, tfrrs_athlete_id, athlete_name, leg_order
         FROM public.relay_athletes WHERE athlete_id=$1 ORDER BY relay_athlete_id`, [oldId]
    ),
    pool.query(
      `SELECT relay_athlete_id, relay_result_id, athlete_id, tfrrs_athlete_id, athlete_name, leg_order
         FROM public.relay_athletes WHERE athlete_id=$1 ORDER BY relay_athlete_id`, [targetId]
    ),
  ]);
  const sourceLinks = results.rows.length
    ? (await pool.query(
      `SELECT source_record_id, result_id FROM ingest.source_links
        WHERE result_id = ANY($1::bigint[])`,
      [results.rows.map(row => Number(row.result_id))]
    )).rows
    : [];
  return {
    athletes: athletes.rows,
    results: results.rows,
    targetResults: targetResults.rows,
    profileOwners: profileOwners.rows,
    sourceLinks,
    dependentCounts: dependentCounts.rows,
    relayLegs: relayLegs.rows,
    targetRelayLegs: targetRelayLegs.rows,
  };
}

async function commitPlan(pool, plan) {
  if (plan.action !== 'merge') throw new Error(`refusing athlete merge: ${plan.reason}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT athlete_id FROM public.athletes WHERE athlete_id = ANY($1::bigint[]) FOR UPDATE', [
      [plan.old_athlete_id, plan.target_athlete_id]
    ]);
    await client.query('CREATE TABLE IF NOT EXISTS public.results_athlete_merge_backup (LIKE public.results INCLUDING DEFAULTS)');
    if (plan.delete_result_ids.length) {
      await client.query(
        `INSERT INTO public.results_athlete_merge_backup
         SELECT * FROM public.results WHERE result_id = ANY($1::bigint[])
         ON CONFLICT DO NOTHING`, [plan.delete_result_ids]
      );
      for (const mapping of plan.duplicateMappings || []) {
        await client.query(
          `UPDATE ingest.source_links SET result_id=$2, relay_result_id=NULL, last_seen_at=now()
            WHERE result_id=$1`, [mapping.old_result_id, mapping.target_result_id]
        );
        if (mapping.source_record_ids.length) {
          await client.query(
            `UPDATE ingest.observations
                SET target_athlete_id=$2, canonical_result_id=$3,
                    decision='skip_duplicate', decision_reason='reviewed_athlete_merge_duplicate', confidence=1
              WHERE source_record_id = ANY($1::bigint[])`,
            [mapping.source_record_ids, plan.target_athlete_id, mapping.target_result_id]
          );
        }
      }
      await client.query('DELETE FROM public.results WHERE result_id = ANY($1::bigint[])', [plan.delete_result_ids]);
    }
    for (const relayLeg of plan.relay_leg_moves || []) {
      await client.query(
        `UPDATE public.relay_athletes
            SET athlete_id=$2, tfrrs_athlete_id=$3, athlete_name=$4
          WHERE relay_athlete_id=$1 AND athlete_id=$5`,
        [relayLeg.old_relay_athlete_id, plan.target_athlete_id, plan.target_tfrrs_athlete_id,
          plan.target_athlete_name, plan.old_athlete_id]
      );
    }
    if (plan.move_result_ids.length) {
      await client.query(
        `UPDATE public.results SET athlete_id=$2 WHERE athlete_id=$1 AND result_id=ANY($3::bigint[])`,
        [plan.old_athlete_id, plan.target_athlete_id, plan.move_result_ids]
      );
    }
    await client.query(
      `UPDATE public.athletes
          SET athletic_net_url=$2, updated_at=now()
        WHERE athlete_id=$1 AND (athletic_net_url IS NULL OR athletic_net_url=$2)`,
      [plan.target_athlete_id, plan.athletic_net_url]
    );
    await client.query(
      `UPDATE public.athletes SET athletic_net_url=NULL, is_active=false, updated_at=now()
        WHERE athlete_id=$1 AND athletic_net_url=$2`, [plan.old_athlete_id, plan.athletic_net_url]
    );
    await client.query(
      `UPDATE ingest.observations SET target_athlete_id=$2 WHERE target_athlete_id=$1`,
      [plan.old_athlete_id, plan.target_athlete_id]
    );
    await client.query(
      `INSERT INTO ingest.athlete_aliases
        (source, source_athlete_key, source_athlete_name, source_gender,
         target_athlete_id, match_method, status, notes, verified_at, updated_at)
       SELECT 'athletic_net', $1, $2, a.gender, $3, 'verified_alias', 'active', $4, now(), now()
         FROM public.athletes a WHERE a.athlete_id=$3
       ON CONFLICT (source, source_athlete_key) DO NOTHING`,
      [plan.source_athlete_key, plan.source_athlete_name || 'Brooklyn Harmon', plan.target_athlete_id,
        'Reviewed merge: exact Athletic.net profile identity transferred from duplicate athlete.']
    );
    const verify = await client.query(
      `SELECT
         (SELECT count(*) FROM public.results WHERE athlete_id=$1)::int AS old_results,
         (SELECT count(*) FROM public.relay_athletes WHERE athlete_id=$1)::int AS old_relay_legs,
         (SELECT is_active FROM public.athletes WHERE athlete_id=$1) AS old_active,
         (SELECT athletic_net_url FROM public.athletes WHERE athlete_id=$2) AS target_url,
         (SELECT count(*) FROM ingest.athlete_aliases WHERE source='athletic_net' AND source_athlete_key=$3 AND target_athlete_id=$2 AND status='active')::int AS alias_count`,
      [plan.old_athlete_id, plan.target_athlete_id, plan.source_athlete_key]
    );
    const row = verify.rows[0];
    if (row.old_results !== 0 || row.old_relay_legs !== 0 || row.old_active !== false
      || row.target_url !== plan.athletic_net_url || row.alias_count !== 1) {
      throw new Error(`athlete merge verification failed: ${JSON.stringify(row)}`);
    }
    await client.query('COMMIT');
    return { results_moved: plan.move_result_ids.length, results_deleted_as_duplicates: plan.delete_result_ids.length, aliases_created_or_verified: 1 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function run({ manifestPath = DEFAULT_MANIFEST, commit = false, env = process.env, pool = null } = {}) {
  const manifest = readManifest(manifestPath);
  const decision = manifest.decisions[0];
  const ownsPool = !pool;
  const db = pool || new Pool({
    connectionString: env.INGEST_DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-reviewed-athlete-merge',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    if (!env.INGEST_DATABASE_URL && !pool) throw new Error('INGEST_DATABASE_URL is required');
    const state = await loadState(db, decision);
    const plan = buildPlan(decision, state);
    // Keep the explicit mappings available to the transactional writer after validation.
    if (plan.action === 'merge') {
      plan.duplicateMappings = decision.duplicate_result_mappings.map(mapping => ({
        old_result_id: Number(mapping.old_result_id),
        target_result_id: Number(mapping.target_result_id),
        source_record_ids: plan.duplicate_source_links
          .filter(row => row.result_id === Number(mapping.old_result_id))
          .map(row => row.source_record_id),
      }));
      plan.source_athlete_name = decision.source_athlete_name;
    }
    const outcome = commit ? await commitPlan(db, plan) : { results_moved: 0, results_deleted_as_duplicates: 0, aliases_created_or_verified: 0 };
    return { mode: commit ? 'commit' : 'dry_run', plan, ...outcome };
  } finally {
    if (ownsPool) await db.end();
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  run({ manifestPath: args.manifest, commit: args.commit })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(`ERROR ${error.message}`); process.exit(1); });
}

module.exports = { buildPlan, namesCompatible, normalizeName, parseArgs, readManifest, resultKey, run };
