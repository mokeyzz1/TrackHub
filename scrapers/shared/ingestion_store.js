/**
 * PostgreSQL writer for the private ingest control plane.
 *
 * This is intentionally separate from the public Supabase Data API client. The ingestion worker
 * needs transactions, bounded connection pools, and access to the private `ingest` schema; the
 * mobile/web clients must never receive those privileges.
 */

const { Pool } = require('pg');
const { keyForSourceRecord } = require('./result_matcher');

const BATCH_SIZE = 500;
const DEFAULT_QUERY_TIMEOUT_MS = 30000;

function connectionStringFromEnv(env = process.env) {
  // Controlled ingestion must opt into its private database explicitly. Falling back to a
  // generic DATABASE_URL can silently target a developer's local database or another service.
  return env.INGEST_DATABASE_URL || null;
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required for the ingestion control plane`);
  return value;
}

function queryTimeoutFromEnv(env = process.env) {
  const configured = Number(env.INGEST_QUERY_TIMEOUT_MS || DEFAULT_QUERY_TIMEOUT_MS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_QUERY_TIMEOUT_MS;
}

function chunk(items, size = BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function json(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

class IngestionStore {
  constructor({ pool, env = process.env } = {}) {
    this.env = env;
    this.pool = pool || new Pool({
      connectionString: required(connectionStringFromEnv(env), 'INGEST_DATABASE_URL'),
      max: 4,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      query_timeout: queryTimeoutFromEnv(env),
      application_name: 'trackhub-ingestion-worker',
      ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    this.ownsPool = !pool;
  }

  async startRun({ source, mode, scope = {}, parserVersion, codeRevision = null }) {
    const { rows } = await this.pool.query(
      `INSERT INTO ingest.runs
         (source, mode, status, scope, parser_version, code_revision, started_at)
       VALUES ($1, $2, 'running', $3::jsonb, $4, $5, now())
       RETURNING run_id`,
      [source, mode, JSON.stringify(scope), required(parserVersion, 'parserVersion'), codeRevision]
    );
    return rows[0].run_id;
  }

  async finishRun(runId, { status, metrics = {}, errorMessage = null }) {
    await this.pool.query(
      `UPDATE ingest.runs
          SET status = $2,
              metrics = $3::jsonb,
              error_message = $4,
              finished_at = now()
        WHERE run_id = $1`,
      [runId, status, JSON.stringify(metrics), errorMessage]
    );
  }

  /**
   * Persist a normalized batch atomically. Source identities are upserted first; each observation
   * then points at the stable source row. A failed batch rolls back both halves.
   */
  async persistObservations(runId, records) {
    if (!runId) throw new Error('runId is required');
    if (!Array.isArray(records) || records.length === 0) return { sourceRecords: 0, observations: 0 };

    // Validate the whole call, not individual SQL chunks: chunk boundaries must not change
    // whether duplicate or mismatched provenance is accepted.
    const seenKeys = new Set();
    for (const record of records) {
      required(record.sourceRecord?.source, 'source');
      required(record.sourceRecord?.source_record_key, 'source_record_key');
      const key = keyForSourceRecord(record.sourceRecord);
      if (!record.observation || keyForSourceRecord(record.observation) !== key) {
        throw new Error('observation/source record identity mismatch');
      }
      if (seenKeys.has(key)) throw new Error(`duplicate source record in batch: ${key}`);
      seenKeys.add(key);
    }

    const client = await this.pool.connect();
    let sourceRecords = 0;
    let observations = 0;

    try {
      await client.query('BEGIN');

      for (const batch of chunk(records)) {
        const sourceRows = batch.map(record => ({
          source: record.sourceRecord.source,
          source_record_key: record.sourceRecord.source_record_key,
          source_meet_key: record.sourceRecord.source_meet_key || null,
          source_event_key: record.sourceRecord.source_event_key || null,
          source_url: record.sourceRecord.source_url || null,
          payload_hash: record.sourceRecord.payload_hash || null,
          payload: json(record.sourceRecord.payload, {})
        }));

        await client.query(
          `WITH incoming AS (
             SELECT *
             FROM jsonb_to_recordset($1::jsonb) AS x(
               source text,
               source_record_key text,
               source_meet_key text,
               source_event_key text,
               source_url text,
               payload_hash text,
               payload jsonb
             )
           )
           INSERT INTO ingest.source_records AS sr
             (source, source_record_key, source_meet_key, source_event_key, source_url, payload_hash, payload)
           SELECT source, source_record_key, source_meet_key, source_event_key, source_url, payload_hash, payload
           FROM incoming
           ON CONFLICT (source, source_record_key) DO UPDATE
             SET source_meet_key = COALESCE(EXCLUDED.source_meet_key, sr.source_meet_key),
                 source_event_key = COALESCE(EXCLUDED.source_event_key, sr.source_event_key),
                 source_url = COALESCE(EXCLUDED.source_url, sr.source_url),
                 payload_hash = COALESCE(EXCLUDED.payload_hash, sr.payload_hash),
                 payload = CASE WHEN EXCLUDED.payload = '{}'::jsonb THEN sr.payload ELSE EXCLUDED.payload END,
                 last_seen_at = now()`,
          [JSON.stringify(sourceRows)]
        );

        const observationRows = batch.map(record => {
          const validationErrors = json(record.observation.validation_errors, []);
          return {
            source: record.observation.source,
            source_record_key: record.observation.source_record_key,
            entity_type: record.observation.entity_type,
            target_meet_id: record.observation.target_meet_id,
            target_athlete_id: record.observation.target_athlete_id,
            target_team_id: record.observation.target_team_id,
            event_type_id: record.observation.event_type_id,
            raw_event_name: record.observation.raw_event_name,
            measure: record.observation.measure,
            mark_raw: record.observation.mark_raw,
            mark_seconds: record.observation.mark_seconds,
            mark_meters: record.observation.mark_meters,
            points: record.observation.points,
            place: record.observation.place,
            round: record.observation.round,
            result_date: record.observation.result_date,
            performance_key: record.observation.performance_key,
            canonical_key: record.observation.canonical_key,
            decision: record.observation.decision,
            decision_reason: record.observation.decision_reason || validationErrors[0]?.code || null,
            confidence: record.observation.confidence ?? null,
            validation_errors: validationErrors
          };
        });

        const persisted = await client.query(
          `WITH incoming AS (
             SELECT *
             FROM jsonb_to_recordset($1::jsonb) AS x(
               source text,
               source_record_key text,
               entity_type text,
               target_meet_id integer,
               target_athlete_id bigint,
               target_team_id bigint,
               event_type_id integer,
               raw_event_name text,
               measure text,
               mark_raw text,
               mark_seconds double precision,
               mark_meters double precision,
               points double precision,
               place integer,
               round text,
               result_date date,
               performance_key text,
               canonical_key text,
               decision text,
               decision_reason text,
               confidence numeric,
               validation_errors jsonb
             )
           )
           INSERT INTO ingest.observations AS existing
             (run_id, source_record_id, source, entity_type, target_meet_id, target_athlete_id,
              target_team_id, event_type_id, raw_event_name, measure, mark_raw, mark_seconds,
              mark_meters, points, place, round, result_date, performance_key, canonical_key,
              decision, decision_reason, confidence, validation_errors)
           SELECT $2, sr.source_record_id, i.source, i.entity_type, i.target_meet_id, i.target_athlete_id,
                  i.target_team_id, i.event_type_id, i.raw_event_name, i.measure, i.mark_raw, i.mark_seconds,
                  i.mark_meters, i.points, i.place, i.round, i.result_date, i.performance_key, i.canonical_key,
                  i.decision, i.decision_reason, i.confidence, i.validation_errors
           FROM incoming i
           JOIN ingest.source_records sr
             ON sr.source = i.source AND sr.source_record_key = i.source_record_key
           ON CONFLICT (run_id, source_record_id) DO UPDATE
             SET source_record_id = existing.source_record_id
           WHERE (existing.source, existing.entity_type, existing.target_meet_id,
                  existing.target_athlete_id, existing.target_team_id, existing.event_type_id,
                  existing.raw_event_name, existing.measure, existing.mark_raw,
                  existing.mark_seconds, existing.mark_meters, existing.points, existing.place,
                  existing.round, existing.result_date, existing.performance_key,
                  existing.canonical_key, existing.validation_errors)
             IS NOT DISTINCT FROM
                 (EXCLUDED.source, EXCLUDED.entity_type, EXCLUDED.target_meet_id,
                  EXCLUDED.target_athlete_id, EXCLUDED.target_team_id, EXCLUDED.event_type_id,
                  EXCLUDED.raw_event_name, EXCLUDED.measure, EXCLUDED.mark_raw,
                  EXCLUDED.mark_seconds, EXCLUDED.mark_meters, EXCLUDED.points, EXCLUDED.place,
                  EXCLUDED.round, EXCLUDED.result_date, EXCLUDED.performance_key,
                  EXCLUDED.canonical_key, EXCLUDED.validation_errors)`,
          [JSON.stringify(observationRows), runId]
        );

        // Exact retries preserve the writer's decision/canonical links. A changed observation
        // needs a new run and review; roll back the source payload upsert as well on conflict.
        if (persisted.rowCount !== batch.length) {
          throw new Error('conflicting observation restaged in the same run');
        }

        sourceRecords += batch.length;
        observations += batch.length;
      }

      await client.query('COMMIT');
      return { sourceRecords, observations };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.ownsPool) await this.pool.end();
  }
}

module.exports = {
  DEFAULT_QUERY_TIMEOUT_MS,
  IngestionStore,
  connectionStringFromEnv,
  chunk,
  queryTimeoutFromEnv
};
