#!/usr/bin/env node
/**
 * Apply one explicitly reviewed source correction without creating a replacement fact.
 *
 * The correction must already be quarantined as `source_correction_required` and must reference
 * an immutable source snapshot. The existing canonical fact is locked, copied to the private
 * before-image archive, updated only for supported fact fields, and the quarantine is resolved.
 * No new table or source payload is created by this command.
 *
 *   INGEST_DATABASE_URL='postgresql://...' node apply_source_correction.js \
 *     --observation-id <id> --operation-key correction_20260908_001 --dry-run
 *   # after reviewing the plan:
 *     ... --observation-id <id> --operation-key correction_20260908_001 --commit
 */

const path = require('path');
const { Pool } = require('pg');
const { sourceCorrectionFields } = require('../shared/source_correction');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ALLOWED_FIELDS = new Set(['meet', 'event', 'mark', 'place', 'date', 'team']);
const UNSUPPORTED_FIELDS = new Set(['athlete', 'entity_type', 'linked_target_missing']);

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const observationId = valueAfter(argv, '--observation-id');
  const operationKey = valueAfter(argv, '--operation-key');
  if (!observationId || !/^\d+$/.test(observationId)) throw new Error('--observation-id must be numeric');
  if (!operationKey || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/.test(operationKey)) {
    throw new Error('--operation-key must be 3-128 characters using letters, numbers, ., _, :, or -');
  }
  if (!argv.includes('--commit') && !argv.includes('--dry-run')) {
    throw new Error('source correction requires --dry-run or --commit after review');
  }
  return {
    observationId: Number(observationId),
    operationKey,
    operator: valueAfter(argv, '--operator') || process.env.CORRECTION_OPERATOR || 'operator',
    commit: argv.includes('--commit'),
  };
}

function connectionString(env = process.env) {
  return env.INGEST_DATABASE_URL || null;
}

function linkedTarget(row) {
  const resultId = row.linked_result_id == null ? null : Number(row.linked_result_id);
  const relayId = row.linked_relay_result_id == null ? null : Number(row.linked_relay_result_id);
  if (resultId && !relayId) return { table: 'public.results', id: resultId, kind: 'result' };
  if (relayId && !resultId) return { table: 'public.relay_results', id: relayId, kind: 'relay' };
  return null;
}

function validateCorrection(row) {
  if (!row) throw new Error('source correction observation not found');
  if (row.decision !== 'quarantine') throw new Error(`observation decision must be quarantine; found ${row.decision}`);
  if (row.quarantine_status !== 'open') throw new Error(`quarantine must be open; found ${row.quarantine_status}`);
  if (row.reason_code !== 'source_correction_required') {
    throw new Error(`quarantine reason must be source_correction_required; found ${row.reason_code}`);
  }
  if (!row.source_snapshot_hash || row.snapshot_hash !== row.source_snapshot_hash) {
    throw new Error('source correction requires an immutable source snapshot');
  }
  const target = linkedTarget(row);
  if (!target) throw new Error('source correction requires exactly one linked canonical fact');
  if (row.entity_type === 'relay_leg') throw new Error('relay-leg corrections require a lineup-aware review workflow');
  const fields = sourceCorrectionFields(row);
  if (!fields.length) throw new Error('observation no longer differs from its linked canonical fact');
  const unsupported = fields.filter(field => UNSUPPORTED_FIELDS.has(field));
  if (unsupported.length) throw new Error(`unsupported source correction fields: ${unsupported.join(', ')}`);
  const unexpected = fields.filter(field => !ALLOWED_FIELDS.has(field));
  if (unexpected.length) throw new Error(`unrecognized source correction fields: ${unexpected.join(', ')}`);
  if (fields.includes('meet') && row.target_meet_id == null) throw new Error('meet correction requires a target meet');
  if (fields.includes('event') && row.event_type_id == null) throw new Error('event correction requires a target event');
  if (fields.includes('mark') && !row.mark_raw) throw new Error('mark correction requires a source mark');
  if (fields.includes('team') && row.target_team_id == null) throw new Error('team correction requires a target team');
  return { target, fields };
}

function correctionUpdates(row, fields) {
  const updates = {};
  if (fields.includes('meet')) updates.meet_id = row.target_meet_id;
  if (fields.includes('event')) {
    updates.event_type_id = row.event_type_id;
    updates.event_name = row.event_code || row.raw_event_name;
  }
  if (fields.includes('mark')) {
    updates.mark_raw = row.mark_raw;
    updates.mark_seconds = row.mark_seconds;
    if (row.entity_type !== 'relay_result') updates.mark_meters = row.mark_meters;
  }
  if (fields.includes('place')) updates.place = row.place;
  if (fields.includes('date')) updates.date = row.result_date;
  if (fields.includes('team')) updates.team_id = row.target_team_id;
  return updates;
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function loadCorrection(pool, observationId) {
  const { rows } = await pool.query(
    `SELECT o.*, q.quarantine_id, q.reason_code, q.status AS quarantine_status,
            sr.source_record_key, sv.snapshot_hash,
            et.code AS event_code,
            sl.result_id AS linked_result_id,
            sl.relay_result_id AS linked_relay_result_id,
            sl.entity_type AS linked_entity_type,
            CASE WHEN sl.result_id IS NOT NULL THEN to_jsonb(r)
                 WHEN sl.relay_result_id IS NOT NULL THEN to_jsonb(rr)
            END AS linked_fact
       FROM ingest.observations o
       JOIN ingest.quarantine q ON q.observation_id = o.observation_id
       JOIN ingest.source_records sr ON sr.source_record_id = o.source_record_id
       LEFT JOIN ingest.source_record_versions sv
         ON sv.source_record_id = o.source_record_id
        AND sv.snapshot_hash = o.source_snapshot_hash
       LEFT JOIN public.event_types et ON et.event_type_id = o.event_type_id
       JOIN ingest.source_links sl ON sl.source_record_id = o.source_record_id
       LEFT JOIN public.results r ON r.result_id = sl.result_id
       LEFT JOIN public.relay_results rr ON rr.relay_result_id = sl.relay_result_id
      WHERE o.observation_id = $1
      FOR UPDATE OF o, q, sl`,
    [observationId]
  );
  return rows[0] || null;
}

async function lockCanonicalFact(client, row) {
  const target = linkedTarget(row);
  if (!target) return null;
  const query = target.kind === 'result'
    ? 'SELECT to_jsonb(r) AS fact FROM public.results r WHERE r.result_id = $1 FOR UPDATE'
    : 'SELECT to_jsonb(rr) AS fact FROM public.relay_results rr WHERE rr.relay_result_id = $1 FOR UPDATE';
  const { rows } = await client.query(query, [target.id]);
  row.linked_fact = rows[0]?.fact || null;
  return row;
}

async function applyCorrection({ observationId, operationKey, operator, commit = true, env = process.env, pool: providedPool = null } = {}) {
  const url = connectionString(env);
  if (!providedPool && !url) throw new Error('INGEST_DATABASE_URL is required for source correction');
  const pool = providedPool || new Pool({
      connectionString: url,
      max: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      application_name: 'trackhub-source-correction',
      ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  const ownsPool = !providedPool;

  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    const row = await loadCorrection(client, observationId);
    if (row) await lockCanonicalFact(client, row);
    const { target, fields } = validateCorrection(row);
    const updates = correctionUpdates(row, fields);
    const updateEntries = Object.entries(updates);
    if (!updateEntries.length) throw new Error('source correction produced no supported fact updates');

    const existingArchive = await client.query(
      `SELECT archive_id, source_table, source_pk FROM ingest.fact_cleanup_archive
        WHERE operation_key = $1
        FOR UPDATE`,
      [operationKey]
    );
    if (existingArchive.rowCount) {
      throw new Error(`operation key already exists (${existingArchive.rows.map(row => `${row.source_table}#${row.source_pk}`).join(', ')})`);
    }

    const plan = { observationId, operationKey, target, fields, updates };
    if (!commit) {
      await client.query('ROLLBACK');
      return { committed: false, ...plan };
    }

    await client.query(
      `INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [operationKey, target.table, String(target.id), JSON.stringify(row.linked_fact)]
    );

    const setSql = updateEntries.map(([column], index) => `${quoteIdentifier(column)} = $${index + 2}`).join(', ');
    const values = [target.id, ...updateEntries.map(([, value]) => value)];
    const table = target.table === 'public.results' ? 'public.results' : 'public.relay_results';
    const pk = target.kind === 'result' ? 'result_id' : 'relay_result_id';
    const updated = await client.query(
      `UPDATE ${table} SET ${setSql} WHERE ${pk} = $1 RETURNING ${pk}`,
      values
    );
    if (updated.rowCount !== 1) throw new Error(`expected one canonical fact update, got ${updated.rowCount}`);

    await client.query(
      `UPDATE ingest.observations
          SET decision = 'claim', decision_reason = 'source_correction_applied', confidence = 1,
              canonical_result_id = $2, canonical_relay_id = $3
        WHERE observation_id = $1`,
      [observationId, target.kind === 'result' ? target.id : null, target.kind === 'relay' ? target.id : null]
    );
    await client.query(
      `UPDATE ingest.quarantine
          SET status = 'resolved',
              resolution_note = $2,
              resolved_at = now()
        WHERE observation_id = $1 AND status = 'open'`,
      [observationId, `Applied ${operationKey} by ${String(operator).slice(0, 200)}`]
    );
    await client.query('COMMIT');
    return { committed: true, ...plan };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    if (ownsPool) await pool.end();
  }
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    applyCorrection(args)
      .then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(error => { console.error(`Source correction failed: ${error.message}`); process.exitCode = 1; });
  } catch (error) {
    console.error(`Source correction rejected: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  ALLOWED_FIELDS,
  applyCorrection,
  connectionString,
  correctionUpdates,
  linkedTarget,
  parseArgs,
  validateCorrection,
};
