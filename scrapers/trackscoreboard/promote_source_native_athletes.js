#!/usr/bin/env node
/**
 * Create reviewed source-native athletes from TrackScoreboard relay-leg quarantines.
 *
 * TrackScoreboard provides a stable tenant-scoped athlete ID, but not every LAI athlete has a
 * TFRRS or Athletic.net profile. This path creates a public athlete only when all of the following
 * are true:
 *   - the source athlete key, name, gender, and canonical school are consistent in the run;
 *   - the source team was resolved through a verified team alias;
 *   - no existing athlete has the same normalized name and gender anywhere in the database; and
 *   - no second source identity in the same run has that name and gender.
 *
 * It does not merge or rename existing athletes. The source alias preserves the exact provenance
 * so a later TFRRS/Athletic.net identity can be reviewed and attached without losing this source.
 * Dry-run is the default; --commit --allow-create is required to write.
 */

const path = require('path');
const { Pool } = require('pg');
const { parseName } = require('../shared/name_parser');
const { ensureIngestDatabaseUrl } = require('../shared/private_database_url');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const LAI_EVIDENCE_URL = 'https://laipr.org/la-uagm-regresa-al-reinado-de-los-campeonatos-de-relevos-de-la-lai/';

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const runId = valueAfter(argv, '--run-id');
  if (!runId) throw new Error('--run-id is required');
  return {
    runId,
    commit: argv.includes('--commit'),
    allowCreate: argv.includes('--allow-create'),
  };
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesCompatible(left, right) {
  const source = normalizeName(left);
  const target = normalizeName(right);
  return Boolean(source && target && (
    source === target || source.endsWith(` ${target}`) || target.endsWith(` ${source}`)
  ));
}

function sourceAthleteGender(payload, sourceAthleteKey, sourceName) {
  const rawAthletes = payload?.payload?.raw_result?.athletes;
  if (Array.isArray(rawAthletes)) {
    const sourceId = String(sourceAthleteKey || '').split('|').pop();
    const match = rawAthletes.find(athlete => String(athlete?.id || '') === sourceId)
      || rawAthletes.find(athlete => normalizeName(`${athlete?.fname || ''} ${athlete?.lname || ''}`) === normalizeName(sourceName));
    if (match?.gender === 'M' || match?.gender === 'F') return match.gender;
  }
  return payload?.team_gender === 'M' || payload?.team_gender === 'F'
    ? payload.team_gender
    : null;
}

function sourceAthleteDetails(row) {
  const payload = row.payload || {};
  const leg = payload.leg || {};
  const sourceAthleteKey = String(leg.source_athlete_key || '').trim();
  const sourceName = String(leg.athlete_name || '').trim();
  return {
    sourceAthleteKey,
    sourceName,
    sourceGender: sourceAthleteGender(payload, sourceAthleteKey, sourceName),
    sourceTeamName: payload.team_name || null,
    sourceUrl: payload.source_url || null,
    sourceRecordKey: row.source_record_key,
    targetMeetId: row.target_meet_id,
    targetTeamId: row.target_team_id == null ? null : Number(row.target_team_id),
    observationId: row.observation_id,
  };
}

function groupCandidates(rows) {
  const groups = new Map();
  for (const row of rows) {
    const detail = sourceAthleteDetails(row);
    if (!detail.sourceAthleteKey || !detail.sourceName) continue;
    if (!groups.has(detail.sourceAthleteKey)) {
      groups.set(detail.sourceAthleteKey, {
        source: 'trackscoreboard',
        source_athlete_key: detail.sourceAthleteKey,
        source_athlete_name: detail.sourceName,
        source_gender: detail.sourceGender,
        target_meet_id: detail.targetMeetId,
        target_team_id: detail.targetTeamId,
        source_team_name: detail.sourceTeamName,
        source_url: detail.sourceUrl,
        observation_ids: [],
        source_record_keys: [],
        target_team_ids: [],
        inconsistent: [],
      });
    }
    const group = groups.get(detail.sourceAthleteKey);
    group.observation_ids.push(detail.observationId);
    group.source_record_keys.push(detail.sourceRecordKey);
    if (detail.targetTeamId != null && !group.target_team_ids.includes(detail.targetTeamId)) {
      group.target_team_ids.push(detail.targetTeamId);
    }
    if (normalizeName(group.source_athlete_name) !== normalizeName(detail.sourceName)
      || group.source_gender !== detail.sourceGender) {
      group.inconsistent.push(detail);
    }
  }
  return [...groups.values()];
}

function buildPlan(groups, {
  teams = [],
  existingAthletes = [],
  existingAliases = [],
} = {}) {
  const teamsById = new Map(teams.map(row => [Number(row.team_id), row]));
  const aliasesByKey = new Map(existingAliases.map(row => [String(row.source_athlete_key).trim(), row]));

  const plannedByName = new Map();
  const plan = groups.map(group => {
    const sourceKey = String(group.source_athlete_key).trim();
    const nameKey = `${normalizeName(group.source_athlete_name)}|${group.source_gender || ''}`;
    const team = teamsById.get(Number(group.target_team_id));
    const targetTeamIds = [...new Set(
      (group.target_team_ids || [group.target_team_id])
        .filter(value => value != null)
        .map(Number)
        .filter(Number.isInteger)
    )];
    const teamsForIdentity = targetTeamIds.map(teamId => teamsById.get(teamId)).filter(Boolean);
    const schoolIds = [...new Set(teamsForIdentity.map(row => Number(row.school_id)).filter(Number.isInteger))];
    const base = {
      ...group,
      target_team: team || null,
      expected_school: team?.official_name || null,
      evidence: [group.source_url, LAI_EVIDENCE_URL].filter(Boolean),
    };

    if (group.inconsistent.length) {
      return { ...base, action: 'hold', reason: 'source_identity_inconsistent' };
    }
    if (!group.source_gender) return { ...base, action: 'hold', reason: 'source_gender_missing' };
    if (!team) return { ...base, action: 'hold', reason: 'canonical_team_missing' };
    if (teamsForIdentity.length !== targetTeamIds.length || schoolIds.length !== 1) {
      return { ...base, action: 'hold', reason: 'canonical_team_school_inconsistent' };
    }
    if (aliasesByKey.has(sourceKey)) {
      const alias = aliasesByKey.get(sourceKey);
      return Number(alias.target_athlete_id) > 0 && alias.status === 'active'
        ? { ...base, action: 'already_active', reason: 'source_alias_already_active', existing_alias: alias }
        : { ...base, action: 'hold', reason: 'source_alias_conflict', existing_alias: alias };
    }
    const existing = existingAthletes.filter(athlete => (
      athlete.gender === group.source_gender
      && namesCompatible(athlete.full_name, group.source_athlete_name)
    ));
    const sameSchool = existing.filter(athlete => Number(athlete.school_id) === Number(team.school_id));
    if (sameSchool.length === 1) {
      return {
        ...base,
        action: 'link_existing',
        reason: 'unique_same_school_existing_athlete',
        target_athlete: sameSchool[0],
      };
    }
    if (existing.length) return { ...base, action: 'hold', reason: 'same_name_gender_exists', existing_athletes: existing };
    if (plannedByName.has(nameKey)) {
      return { ...base, action: 'hold', reason: 'same_name_gender_in_batch', conflicting_source_key: plannedByName.get(nameKey) };
    }
    plannedByName.set(nameKey, sourceKey);
    return {
      ...base,
      action: 'create_and_alias',
      reason: 'verified_source_native_identity_without_existing_name_collision',
      athlete: {
        school_id: Number(team.school_id),
        full_name: group.source_athlete_name,
        ...(parseName(group.source_athlete_name) || {}),
        gender: group.source_gender,
        tfrrs_athlete_id: null,
        tfrrs_profile_url: null,
        athletic_net_url: null,
        is_active: true,
      },
    };
  });

  // If a duplicate source name appeared later in the same batch, hold the earlier planned row too.
  const batchConflicts = new Map();
  for (const row of plan) {
    if (row.action !== 'create_and_alias' && row.reason !== 'same_name_gender_in_batch') continue;
    const key = `${normalizeName(row.source_athlete_name)}|${row.source_gender}`;
    if (!batchConflicts.has(key)) batchConflicts.set(key, []);
    if (!batchConflicts.get(key).includes(row.source_athlete_key)) {
      batchConflicts.get(key).push(row.source_athlete_key);
    }
  }
  for (const row of plan) {
    const key = `${normalizeName(row.source_athlete_name)}|${row.source_gender}`;
    const keys = batchConflicts.get(key) || [];
    if ((row.action === 'create_and_alias' || row.reason === 'same_name_gender_in_batch') && keys.length > 1) {
      row.action = 'hold';
      row.reason = 'same_name_gender_in_batch';
      row.conflicting_source_keys = keys.filter(value => value !== row.source_athlete_key);
      delete row.athlete;
    }
  }
  return plan;
}

async function loadState(pool, runId) {
  const runResult = await pool.query(
    `SELECT run_id, source, mode, status, scope
       FROM ingest.runs
      WHERE run_id = $1`,
    [runId]
  );
  const run = runResult.rows[0];
  if (!run) throw new Error(`ingest run ${runId} not found`);
  if (run.source !== 'trackscoreboard') throw new Error(`run source must be trackscoreboard; found ${run.source}`);
  if (!['dry_run', 'commit'].includes(run.mode) || !['succeeded', 'partial'].includes(run.status)) {
    throw new Error(`run must be a successful dry_run or partial commit; found mode=${run.mode}, status=${run.status}`);
  }

  const rowsResult = await pool.query(
    `SELECT o.observation_id, o.target_meet_id, o.target_team_id,
            o.decision, o.decision_reason,
            sr.source_record_key, sr.payload
       FROM ingest.observations o
       JOIN ingest.quarantine q ON q.observation_id = o.observation_id
       JOIN ingest.source_records sr ON sr.source_record_id = o.source_record_id
      WHERE o.run_id = $1
        AND o.entity_type = 'relay_leg'
        AND o.decision = 'quarantine'
        AND o.decision_reason = 'missing_athlete'
        AND q.status = 'open'
      ORDER BY o.observation_id`,
    [runId]
  );
  const groups = groupCandidates(rowsResult.rows);
  const teamIds = [...new Set(
    groups
      .flatMap(row => row.target_team_ids || [row.target_team_id])
      .filter(Number.isInteger)
  )];
  const sourceKeys = groups.map(row => row.source_athlete_key);
  const names = [...new Set(groups.map(row => normalizeName(row.source_athlete_name)).filter(Boolean))];
  const genders = [...new Set(groups.map(row => row.source_gender).filter(Boolean))];

  const teams = teamIds.length
    ? (await pool.query(
      `SELECT t.team_id, t.school_id, s.official_name, s.short_name
         FROM public.teams t
         JOIN public.schools s ON s.school_id = t.school_id
        WHERE t.team_id = ANY($1::bigint[])`,
      [teamIds]
    )).rows
    : [];
  const existingAliases = sourceKeys.length
    ? (await pool.query(
      `SELECT source_athlete_key, target_athlete_id, status
         FROM ingest.athlete_aliases
        WHERE source = 'trackscoreboard'
          AND source_athlete_key = ANY($1::text[])`,
      [sourceKeys]
    )).rows
    : [];
  const normalizedExpression = `trim(regexp_replace(translate(lower(full_name),
    'áàäâãåéèëêíìïîóòöôõúùüûñçýÿ',
    'aaaaaaeeeeiiiiooooouuuuncyy'), '[^a-z0-9]+', ' ', 'g'))`;
  const suffixPatterns = names.map(name => `% ${name}`);
  const existingAthletes = names.length && genders.length
    ? (await pool.query(
      `SELECT athlete_id, full_name, gender, school_id
         FROM public.athletes
        WHERE gender = ANY($1::text[])
          AND (
            ${normalizedExpression} = ANY($2::text[])
            OR ${normalizedExpression} LIKE ANY($3::text[])
          )`,
      [genders, names, suffixPatterns]
    )).rows
    : [];
  return { run, groups, teams, existingAliases, existingAthletes };
}

async function commitPlan(pool, plan) {
  const holds = plan.filter(row => row.action === 'hold');
  const creates = plan.filter(row => row.action === 'create_and_alias');
  const links = plan.filter(row => row.action === 'link_existing');
  if (!creates.length && !links.length) return { athletes_created: 0, aliases_created: 0, held: holds.length };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of [...creates, ...links]) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `trackscoreboard|${row.source_athlete_key}`,
      ]);
      let targetAthleteId;
      if (row.action === 'create_and_alias') {
        const inserted = await client.query(
          `INSERT INTO public.athletes
             (school_id, full_name, first_name, last_name, gender,
              tfrrs_athlete_id, tfrrs_profile_url, athletic_net_url, is_active)
           SELECT $1, $2, $3, $4, $5, NULL, NULL, NULL, true
            WHERE NOT EXISTS (
              SELECT 1
                FROM public.athletes
               WHERE gender = $5
                 AND (
                   trim(regexp_replace(translate(lower(full_name),
                   'áàäâãåéèëêíìïîóòöôõúùüûñçýÿ',
                   'aaaaaaeeeeiiiiooooouuuuncyy'), '[^a-z0-9]+', ' ', 'g'))
                     = trim(regexp_replace(translate(lower($2),
                   'áàäâãåéèëêíìïîóòöôõúùüûñçýÿ',
                   'aaaaaaeeeeiiiiooooouuuuncyy'), '[^a-z0-9]+', ' ', 'g'))
                   OR trim(regexp_replace(translate(lower(full_name),
                   'áàäâãåéèëêíìïîóòöôõúùüûñçýÿ',
                   'aaaaaaeeeeiiiiooooouuuuncyy'), '[^a-z0-9]+', ' ', 'g'))
                     LIKE '%' || ' ' || trim(regexp_replace(translate(lower($2),
                   'áàäâãåéèëêíìïîóòöôõúùüûñçýÿ',
                   'aaaaaaeeeeiiiiooooouuuuncyy'), '[^a-z0-9]+', ' ', 'g'))
                 )
            )
           RETURNING athlete_id`,
          [
            row.athlete.school_id,
            row.athlete.full_name,
            row.athlete.first_name || null,
            row.athlete.last_name || null,
            row.athlete.gender,
          ]
        );
        if (inserted.rowCount !== 1) throw new Error(`source-native athlete guard failed for ${row.source_athlete_key}`);
        targetAthleteId = Number(inserted.rows[0].athlete_id);
        row.created_athlete_id = targetAthleteId;
      } else {
        targetAthleteId = Number(row.target_athlete.athlete_id);
      }
      await client.query(
        `INSERT INTO ingest.athlete_aliases
           (source, source_athlete_key, source_athlete_name, source_gender,
            target_athlete_id, match_method, status, notes, verified_at, updated_at)
         VALUES ('trackscoreboard', $1, $2, $3, $4, 'verified_alias', 'active', $5, now(), now())
         ON CONFLICT (source, source_athlete_key) DO NOTHING`,
        [
          row.source_athlete_key,
          row.source_athlete_name,
          row.source_gender,
          targetAthleteId,
          row.action === 'link_existing'
            ? 'Exact tenant-scoped TrackScoreboard identity; one compatible existing athlete at the verified canonical school; team alias verified from the 2026 LAI relay source.'
            : 'Exact tenant-scoped TrackScoreboard identity; no existing normalized name/gender collision; team alias verified from the 2026 LAI relay source.',
        ]
      );
    }
    const verify = await client.query(
      `SELECT source_athlete_key, target_athlete_id, status
         FROM ingest.athlete_aliases
        WHERE source = 'trackscoreboard'
          AND source_athlete_key = ANY($1::text[])`,
      [[...creates, ...links].map(row => row.source_athlete_key)]
    );
    const byKey = new Map(verify.rows.map(row => [row.source_athlete_key, row]));
    for (const row of [...creates, ...links]) {
      const alias = byKey.get(row.source_athlete_key);
      const expectedAthleteId = row.action === 'link_existing'
        ? Number(row.target_athlete.athlete_id)
        : row.created_athlete_id;
      if (!alias || alias.status !== 'active' || Number(alias.target_athlete_id) !== expectedAthleteId) {
        throw new Error(`source-native alias verification failed for ${row.source_athlete_key}`);
      }
    }
    await client.query('COMMIT');
    return { athletes_created: creates.length, aliases_created: creates.length + links.length, held: holds.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function summarizePlan(plan) {
  return plan.reduce((out, row) => {
    out[row.action] = (out[row.action] || 0) + 1;
    return out;
  }, {});
}

async function run({ runId, commit = false, allowCreate = false, env = process.env, pool = null } = {}) {
  if (commit && !allowCreate) throw new Error('--allow-create is required with --commit');
  const url = ensureIngestDatabaseUrl(env);
  if (!url && !pool) throw new Error('INGEST_DATABASE_URL is required');
  const db = pool || new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-trackscoreboard-source-native-athletes',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    const state = await loadState(db, runId);
    const plan = buildPlan(state.groups, state);
    const outcome = commit ? await commitPlan(db, plan) : { athletes_created: 0, aliases_created: 0 };
    return {
      mode: commit ? 'commit' : 'dry_run',
      run_id: runId,
      summary: summarizePlan(plan),
      ...outcome,
      plan,
    };
  } finally {
    if (!pool) await db.end();
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  run({ runId: args.runId, commit: args.commit, allowCreate: args.allowCreate })
    .then(result => {
      console.log(JSON.stringify({
        mode: result.mode,
        run_id: result.run_id,
        summary: result.summary,
        athletes_created: result.athletes_created,
        aliases_created: result.aliases_created,
        held: result.held,
      }, null, 2));
    })
    .catch(error => { console.error(`ERROR ${error.message}`); process.exit(1); });
}

module.exports = {
  buildPlan,
  namesCompatible,
  groupCandidates,
  normalizeName,
  parseArgs,
  sourceAthleteDetails,
  sourceAthleteGender,
  summarizePlan,
  run,
};
