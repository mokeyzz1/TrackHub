#!/usr/bin/env node
/**
 * Split a reviewed, merged athlete identity without deleting or recreating results.
 *
 * This is a deliberately narrow repair path. The manifest names the exact result rows and
 * relay-leg rows to move, the old identity that currently owns them, and the new verified
 * external identity. Dry-run is the default; --commit is required to write.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_MANIFEST = path.join(__dirname, 'split-identity-decisions.json');

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
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function positiveInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${field} must be a positive integer`);
  return parsed;
}

function uniquePositiveIntegers(values, field) {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${field} must be a non-empty array`);
  const parsed = values.map(value => positiveInteger(value, field));
  if (new Set(parsed).size !== parsed.length) throw new Error(`${field} contains duplicates`);
  return parsed;
}

function readManifest(filePath) {
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!manifest || manifest.manifest_version !== 1 || !Array.isArray(manifest.decisions)) {
    throw new Error('manifest must contain manifest_version: 1 and a decisions array');
  }
  const seenSourceKeys = new Set();
  for (const decision of manifest.decisions) {
    const required = [
      'source_athlete_key', 'source_athlete_name', 'source_gender',
      'old_athlete_id', 'old_tfrrs_athlete_id', 'old_current_school_id', 'old_school_id',
      'new_tfrrs_athlete_id', 'new_school_id', 'new_team_id',
      'new_season_code', 'result_ids', 'relay_athlete_ids', 'evidence'
    ];
    for (const field of required) {
      if (decision[field] == null || (typeof decision[field] === 'string' && !decision[field].trim())) {
        throw new Error(`manifest decision missing ${field}`);
      }
    }
    if (!['M', 'F'].includes(decision.source_gender)) {
      throw new Error(`invalid source_gender for ${decision.source_athlete_key}`);
    }
    if (!Array.isArray(decision.evidence) || decision.evidence.length < 2) {
      throw new Error(`at least two evidence items are required: ${decision.source_athlete_key}`);
    }
    const sourceKey = String(decision.source_athlete_key).trim();
    if (seenSourceKeys.has(sourceKey)) throw new Error(`duplicate source identity: ${sourceKey}`);
    seenSourceKeys.add(sourceKey);
    decision.old_athlete_id = positiveInteger(decision.old_athlete_id, 'old_athlete_id');
    decision.old_current_school_id = positiveInteger(decision.old_current_school_id, 'old_current_school_id');
    decision.old_school_id = positiveInteger(decision.old_school_id, 'old_school_id');
    decision.new_school_id = positiveInteger(decision.new_school_id, 'new_school_id');
    decision.new_team_id = positiveInteger(decision.new_team_id, 'new_team_id');
    decision.result_ids = uniquePositiveIntegers(decision.result_ids, 'result_ids');
    if (!Array.isArray(decision.relay_athlete_ids)) throw new Error('relay_athlete_ids must be an array');
    decision.relay_athlete_ids = decision.relay_athlete_ids.map(value => positiveInteger(value, 'relay_athlete_ids'));
    if (new Set(decision.relay_athlete_ids).size !== decision.relay_athlete_ids.length) {
      throw new Error('relay_athlete_ids contains duplicates');
    }
    if (decision.new_athletic_net_profile_id != null && !String(decision.new_athletic_net_profile_id).trim()) {
      throw new Error(`new_athletic_net_profile_id cannot be blank: ${sourceKey}`);
    }
  }
  return manifest;
}

function expectedNewAthlete(decision) {
  const nameParts = String(decision.source_athlete_name).trim().split(/\s+/);
  return {
    school_id: decision.new_school_id,
    full_name: String(decision.source_athlete_name).trim(),
    first_name: nameParts[0] || null,
    last_name: nameParts.slice(1).join(' ') || null,
    gender: decision.source_gender,
    class_year: decision.new_class_year || null,
    tfrrs_athlete_id: String(decision.new_tfrrs_athlete_id).trim(),
    tfrrs_profile_url: decision.new_tfrrs_profile_url || null,
    athletic_net_url: decision.new_athletic_net_profile_id
      ? `https://www.athletic.net/athlete/${String(decision.new_athletic_net_profile_id).trim()}/track-and-field`
      : null,
    is_active: true,
  };
}

function buildPlan(decisions, stateByOldId) {
  return decisions.map(decision => {
    const state = stateByOldId.get(decision.old_athlete_id) || {};
    const base = {
      source: 'athletic_net',
      source_athlete_key: String(decision.source_athlete_key).trim(),
      source_athlete_name: String(decision.source_athlete_name).trim(),
      source_gender: decision.source_gender,
      old_athlete_id: decision.old_athlete_id,
      old_tfrrs_athlete_id: String(decision.old_tfrrs_athlete_id).trim(),
      old_current_school_id: decision.old_current_school_id,
      old_school_id: decision.old_school_id,
      new_tfrrs_athlete_id: String(decision.new_tfrrs_athlete_id).trim(),
      new_school_id: decision.new_school_id,
      new_team_id: decision.new_team_id,
      new_season_code: decision.new_season_code,
      result_ids: decision.result_ids,
      relay_athlete_ids: decision.relay_athlete_ids,
      evidence: decision.evidence,
      notes: decision.notes || null,
      state,
    };

    const hold = reason => ({ ...base, action: 'hold', reason });
    if (!state.old) return hold('old_athlete_not_found');
    if (String(state.old.tfrrs_athlete_id || '').trim() !== base.old_tfrrs_athlete_id) {
      return hold('old_tfrrs_identity_changed');
    }
    if (state.old.gender !== decision.source_gender) return hold('old_gender_mismatch');
    if (normalizeName(state.old.full_name) !== normalizeName(decision.source_athlete_name)) {
      return hold('old_name_mismatch');
    }
    if (!state.alreadyApplied && Number(state.old.school_id) !== decision.old_current_school_id) {
      return hold('old_school_not_in_expected_merged_state');
    }
    if (state.alreadyApplied && Number(state.old.school_id) !== decision.old_school_id) {
      return hold('completed_split_old_school_mismatch');
    }
    if (state.targetRows && state.targetRows.length > 1) return hold('new_tfrrs_identity_not_unique');
    if (state.targetRows && state.targetRows.length === 1 && Number(state.targetRows[0].athlete_id) !== Number(state.newAthleteId || 0)) {
      // A target row is expected only after an earlier complete application. Partial target state is unsafe.
      if (!state.alreadyApplied) return hold('new_tfrrs_identity_already_belongs_to_another_row');
    }
    if (state.alias && Number(state.alias.target_athlete_id) !== Number(state.newAthleteId || 0)) {
      return hold('source_alias_conflict');
    }
    if (state.resultRows.length !== decision.result_ids.length) return hold('result_manifest_row_count_mismatch');
    if (state.resultRows.some(row => Number(row.athlete_id) !== decision.old_athlete_id)) {
      if (!state.alreadyApplied) return hold('result_row_not_owned_by_old_athlete');
    }
    if (state.resultRows.some(row => Number(row.team_id) !== decision.new_team_id)) {
      return hold('result_team_mismatch');
    }
    if (state.relayRows.length !== decision.relay_athlete_ids.length) return hold('relay_manifest_row_count_mismatch');
    if (state.relayRows.some(row => Number(row.athlete_id) !== decision.old_athlete_id)) {
      if (!state.alreadyApplied) return hold('relay_row_not_owned_by_old_athlete');
    }
    if (state.relayRows.some(row => Number(row.team_id) !== decision.new_team_id)) return hold('relay_team_mismatch');
    if (state.otherAthleteReferences && state.otherAthleteReferences.some(row => Number(row.count) > 0)) {
      return hold('unreviewed_live_or_external_references');
    }

    return {
      ...base,
      action: state.alreadyApplied ? 'already_applied' : 'split_and_alias',
      reason: state.alreadyApplied ? 'verified_existing_split' : 'verified_exact_row_split',
      new_athlete: expectedNewAthlete(decision),
      counts: {
        results_to_move: decision.result_ids.length,
        relay_legs_to_move: decision.relay_athlete_ids.length,
        old_prs_preserved: state.oldPrsCount || 0,
        old_team_seasons_preserved: state.oldTeamSeasonsCount || 0,
      },
    };
  });
}

async function loadState(pool, manifest) {
  const oldIds = manifest.decisions.map(row => row.old_athlete_id);
  const resultIds = manifest.decisions.flatMap(row => row.result_ids);
  const relayAthleteIds = manifest.decisions.flatMap(row => row.relay_athlete_ids);
  const tfrrsIds = manifest.decisions.map(row => String(row.new_tfrrs_athlete_id).trim());
  const sourceKeys = manifest.decisions.map(row => String(row.source_athlete_key).trim());

  const [oldRows, targetRows, resultRows, relayRows, aliases, oldPrs, oldSeasons, oldRefs] = await Promise.all([
    pool.query(
      `SELECT athlete_id, full_name, gender, school_id, tfrrs_athlete_id, tfrrs_profile_url, athletic_net_url
         FROM public.athletes WHERE athlete_id = ANY($1::bigint[])`, [oldIds]
    ),
    pool.query(
      `SELECT athlete_id, full_name, gender, school_id, tfrrs_athlete_id
         FROM public.athletes WHERE tfrrs_athlete_id = ANY($1::text[])`, [tfrrsIds]
    ),
    pool.query(
      `SELECT result_id, athlete_id, team_id, meet_id, event_id, event_name, mark_raw, round, date
         FROM public.results WHERE result_id = ANY($1::bigint[])`, [resultIds]
    ),
    pool.query(
      `SELECT ra.relay_athlete_id, ra.athlete_id, ra.relay_result_id,
              rr.team_id, rr.meet_id, rr.date, rr.event_name, ra.tfrrs_athlete_id
         FROM public.relay_athletes ra
         JOIN public.relay_results rr ON rr.relay_result_id = ra.relay_result_id
        WHERE ra.relay_athlete_id = ANY($1::int[])`, [relayAthleteIds]
    ),
    pool.query(
      `SELECT source, source_athlete_key, target_athlete_id, status
         FROM ingest.athlete_aliases
        WHERE source = 'athletic_net' AND source_athlete_key = ANY($1::text[])`, [sourceKeys]
    ),
    pool.query(
      `SELECT athlete_id, count(*)::int AS count FROM public.athlete_prs
        WHERE athlete_id = ANY($1::bigint[]) GROUP BY athlete_id`, [oldIds]
    ),
    pool.query(
      `SELECT athlete_id, count(*)::int AS count FROM public.athlete_team_seasons
        WHERE athlete_id = ANY($1::bigint[]) GROUP BY athlete_id`, [oldIds]
    ),
    pool.query(
      `SELECT athlete_id, count(*)::int AS count FROM public.live_results
        WHERE athlete_id = ANY($1::bigint[]) GROUP BY athlete_id
       UNION ALL
      SELECT athlete_id, count(*)::int AS count FROM public.unprocessed_live_results
        WHERE athlete_id = ANY($1::bigint[]) GROUP BY athlete_id
       UNION ALL
      SELECT athlete_id, count(*)::int AS count FROM public.external_ids
        WHERE athlete_id = ANY($1::bigint[]) GROUP BY athlete_id`, [oldIds]
    ),
  ]);

  const oldById = new Map(oldRows.rows.map(row => [Number(row.athlete_id), row]));
  const targetByTfrrs = new Map();
  for (const row of targetRows.rows) {
    const key = String(row.tfrrs_athlete_id);
    if (!targetByTfrrs.has(key)) targetByTfrrs.set(key, []);
    targetByTfrrs.get(key).push(row);
  }
  const resultsById = new Map(resultRows.rows.map(row => [Number(row.result_id), row]));
  const relaysById = new Map(relayRows.rows.map(row => [Number(row.relay_athlete_id), row]));
  const aliasesByKey = new Map(aliases.rows.map(row => [String(row.source_athlete_key), row]));
  const prsByAthlete = new Map(oldPrs.rows.map(row => [Number(row.athlete_id), Number(row.count)]));
  const seasonsByAthlete = new Map(oldSeasons.rows.map(row => [Number(row.athlete_id), Number(row.count)]));
  const refsByAthlete = new Map();
  for (const row of oldRefs.rows) refsByAthlete.set(Number(row.athlete_id), (refsByAthlete.get(Number(row.athlete_id)) || 0) + Number(row.count));

  const stateByOldId = new Map();
  for (const decision of manifest.decisions) {
    const old = oldById.get(decision.old_athlete_id) || null;
    const targetList = targetByTfrrs.get(String(decision.new_tfrrs_athlete_id).trim()) || [];
    const newAthleteId = targetList.length === 1 ? Number(targetList[0].athlete_id) : null;
    const resultRowsForDecision = decision.result_ids.map(id => resultsById.get(id)).filter(Boolean);
    const relayRowsForDecision = decision.relay_athlete_ids.map(id => relaysById.get(id)).filter(Boolean);
    const alias = aliasesByKey.get(String(decision.source_athlete_key).trim()) || null;
    const alreadyApplied = Boolean(
      old && newAthleteId &&
      resultRowsForDecision.length === decision.result_ids.length &&
      resultRowsForDecision.every(row => Number(row.athlete_id) === newAthleteId) &&
      relayRowsForDecision.length === decision.relay_athlete_ids.length &&
      relayRowsForDecision.every(row => Number(row.athlete_id) === newAthleteId) &&
      alias && Number(alias.target_athlete_id) === newAthleteId
    );
    stateByOldId.set(decision.old_athlete_id, {
      old,
      targetRows: targetList,
      newAthleteId,
      resultRows: resultRowsForDecision,
      relayRows: relayRowsForDecision,
      alias,
      oldPrsCount: prsByAthlete.get(decision.old_athlete_id) || 0,
      oldTeamSeasonsCount: seasonsByAthlete.get(decision.old_athlete_id) || 0,
      otherAthleteReferences: [{ count: refsByAthlete.get(decision.old_athlete_id) || 0 }],
      alreadyApplied,
    });
  }
  return stateByOldId;
}

async function commitPlan(pool, plan) {
  if (plan.some(row => row.action === 'hold')) throw new Error('refusing commit: plan contains held identity splits');
  const inserts = plan.filter(row => row.action === 'split_and_alias');
  if (!inserts.length) return { splits_applied: 0, results_moved: 0, relay_legs_moved: 0, aliases_created: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let resultsMoved = 0;
    let relayLegsMoved = 0;
    let aliasesCreated = 0;
    for (const row of inserts) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `athlete-split|${row.old_athlete_id}|${row.new_tfrrs_athlete_id}`,
      ]);

      const old = (await client.query(
        `SELECT athlete_id, full_name, gender, school_id, tfrrs_athlete_id
           FROM public.athletes WHERE athlete_id = $1 FOR UPDATE`, [row.old_athlete_id]
      )).rows[0];
      if (!old) throw new Error(`old athlete ${row.old_athlete_id} disappeared`);
      if (String(old.tfrrs_athlete_id || '').trim() !== row.old_tfrrs_athlete_id || Number(old.school_id) !== row.old_current_school_id) {
        throw new Error(`old athlete guard failed for ${row.source_athlete_key}`);
      }

      const currentSchool = await client.query(
        `SELECT school_id FROM public.athletes WHERE athlete_id = $1`, [row.old_athlete_id]
      );
      if (Number(currentSchool.rows[0].school_id) !== row.old_current_school_id) {
        throw new Error(`old athlete current-school guard failed for ${row.source_athlete_key}`);
      }
      const corrected = await client.query(
        `UPDATE public.athletes SET school_id = $2, updated_at = now()
          WHERE athlete_id = $1 AND school_id = $3
         RETURNING athlete_id`, [row.old_athlete_id, row.old_school_id, row.old_current_school_id]
      );
      if (corrected.rowCount !== 1) throw new Error(`old athlete school correction failed for ${row.source_athlete_key}`);

      const inserted = await client.query(
        `INSERT INTO public.athletes
           (school_id, full_name, first_name, last_name, gender, class_year,
            tfrrs_athlete_id, tfrrs_profile_url, athletic_net_url, is_active)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,true
          WHERE NOT EXISTS (SELECT 1 FROM public.athletes WHERE tfrrs_athlete_id = $7)
         RETURNING athlete_id`,
        [
          row.new_athlete.school_id, row.new_athlete.full_name, row.new_athlete.first_name,
          row.new_athlete.last_name, row.new_athlete.gender, row.new_athlete.class_year,
          row.new_athlete.tfrrs_athlete_id, row.new_athlete.tfrrs_profile_url, row.new_athlete.athletic_net_url,
        ]
      );
      if (inserted.rowCount !== 1) throw new Error(`new athlete insert guard failed for ${row.source_athlete_key}`);
      const newAthleteId = Number(inserted.rows[0].athlete_id);

      const movedResults = await client.query(
        `UPDATE public.results SET athlete_id = $2
          WHERE result_id = ANY($1::bigint[]) AND athlete_id = $3 AND team_id = $4
         RETURNING result_id`, [row.result_ids, newAthleteId, row.old_athlete_id, row.new_team_id]
      );
      if (movedResults.rowCount !== row.result_ids.length) {
        throw new Error(`result move guard failed for ${row.source_athlete_key}: ${movedResults.rowCount}/${row.result_ids.length}`);
      }
      resultsMoved += movedResults.rowCount;

      if (row.relay_athlete_ids.length) {
        const movedRelayLegs = await client.query(
          `UPDATE public.relay_athletes SET athlete_id = $2
            WHERE relay_athlete_id = ANY($1::int[]) AND athlete_id = $3
              AND relay_result_id IN (SELECT relay_result_id FROM public.relay_results WHERE team_id = $4)
           RETURNING relay_athlete_id`, [row.relay_athlete_ids, newAthleteId, row.old_athlete_id, row.new_team_id]
        );
        if (movedRelayLegs.rowCount !== row.relay_athlete_ids.length) {
          throw new Error(`relay move guard failed for ${row.source_athlete_key}: ${movedRelayLegs.rowCount}/${row.relay_athlete_ids.length}`);
        }
        relayLegsMoved += movedRelayLegs.rowCount;
      }

      await client.query(
        `INSERT INTO public.athlete_team_seasons
           (athlete_id, team_id, season_code, year_in_school, status)
         VALUES ($1,$2,$3,$4,'active')
         ON CONFLICT (athlete_id, team_id, season_code) DO NOTHING`,
        [newAthleteId, row.new_team_id, row.new_season_code, row.new_athlete.class_year === 'SR-4' ? 'SR' : row.new_athlete.class_year]
      );

      const alias = await client.query(
        `INSERT INTO ingest.athlete_aliases
           (source, source_athlete_key, source_athlete_name, source_gender,
            target_athlete_id, match_method, status, notes, verified_at, updated_at)
         VALUES ('athletic_net',$1,$2,$3,$4,'verified_alias','active',$5,now(),now())
         ON CONFLICT (source, source_athlete_key) DO NOTHING
         RETURNING athlete_alias_id`,
        [row.source_athlete_key, row.source_athlete_name, row.source_gender, newAthleteId, row.notes]
      );
      if (alias.rowCount === 1) aliasesCreated++;
      const verifyAlias = await client.query(
        `SELECT target_athlete_id, status FROM ingest.athlete_aliases
          WHERE source='athletic_net' AND source_athlete_key=$1`, [row.source_athlete_key]
      );
      if (verifyAlias.rowCount !== 1 || Number(verifyAlias.rows[0].target_athlete_id) !== newAthleteId || verifyAlias.rows[0].status !== 'active') {
        throw new Error(`alias verification failed for ${row.source_athlete_key}`);
      }
      row.created_athlete_id = newAthleteId;
    }

    const verify = await client.query(
      `SELECT a.athlete_id, a.school_id, a.tfrrs_athlete_id,
              (SELECT count(*) FROM public.results r WHERE r.athlete_id=a.athlete_id AND r.result_id = ANY($1::bigint[]))::int AS moved_results,
              (SELECT count(*) FROM public.relay_athletes ra WHERE ra.athlete_id=a.athlete_id AND ra.relay_athlete_id = ANY($2::int[]))::int AS moved_relay_legs
         FROM public.athletes a WHERE a.athlete_id = ANY($3::bigint[])`,
      [inserts.flatMap(row => row.result_ids), inserts.flatMap(row => row.relay_athlete_ids), inserts.map(row => row.created_athlete_id)]
    );
    for (const row of inserts) {
      const actual = verify.rows.find(candidate => Number(candidate.athlete_id) === Number(row.created_athlete_id));
      if (!actual || Number(actual.school_id) !== row.new_school_id || String(actual.tfrrs_athlete_id) !== row.new_tfrrs_athlete_id) {
        throw new Error(`new athlete verification failed for ${row.source_athlete_key}`);
      }
    }
    await client.query('COMMIT');
    return { splits_applied: inserts.length, results_moved: resultsMoved, relay_legs_moved: relayLegsMoved, aliases_created: aliasesCreated };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function run({ manifestPath = DEFAULT_MANIFEST, commit = false, env = process.env, pool = null } = {}) {
  const manifest = readManifest(manifestPath);
  const ownsPool = !pool;
  const db = pool || new Pool({
    connectionString: env.INGEST_DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-reviewed-athlete-split',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    if (!env.INGEST_DATABASE_URL && !pool) throw new Error('INGEST_DATABASE_URL is required');
    const state = await loadState(db, manifest);
    const plan = buildPlan(manifest.decisions, state);
    const outcome = commit ? await commitPlan(db, plan) : {
      splits_applied: 0, results_moved: 0, relay_legs_moved: 0, aliases_created: 0,
    };
    return { mode: commit ? 'commit' : 'dry_run', ...outcome, plan };
  } finally {
    if (ownsPool) await db.end();
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  run({ manifestPath: args.manifest, commit: args.commit })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(`ERROR ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  buildPlan,
  normalizeName,
  parseArgs,
  readManifest,
  run,
};
