const { Pool } = require('pg');
const { TeamAliasResolver } = require('../../shared/team_alias_resolver');
const { TeamCatalog, classifyMeet } = require('./domain');

const QUEUE_TABLE = 'ingest.event_recovery_queue';
const RECONCILIATION_KEY = 'reconciliation';

function queueStatusForOutcome(status) {
  if (status === 'matched' || status === 'not_contested') return 'complete';
  if (status === 'blocked') return 'blocked';
  if (status === 'failed') return 'needs_review';
  return 'needs_review';
}

function reconciliationPayload({ scope, status, queueState, result = null, error = null, actions = [] }) {
  if (!result) {
    return {
      scope_key: scope,
      status,
      queue_state: queueState,
      source_event_status: 'unavailable',
      error: error || null,
    };
  }
  return {
    scope_key: scope,
    status: result.status,
    queue_status: queueStatusForOutcome(result.status),
    queue_state: queueState,
    source: 'tfrrs',
    source_url: result.source_snapshot?.source_url || null,
    source_meet_key: result.source_snapshot?.source_meet_key || null,
    relationship_kind: result.relationship?.kind || null,
    canonical_meet_id: result.relationship?.canonical_meet_id || null,
    source_event_status: result.source_event_status || 'unknown',
    source_event_count: result.source_event_count || 0,
    source_result_count: result.source_result_count || 0,
    local_result_count: result.local_result_count || 0,
    matched_result_count: result.matched_result_count || 0,
    missing_result_count: result.missing_result_count || 0,
    extra_result_count: result.extra_result_count || 0,
    invalid_team_result_count: result.invalid_team_result_count || 0,
    unresolved_source_team_count: result.unresolved_source_team_count || 0,
    diff: result.diff || {},
    actions,
    reason: result.reason || null,
  };
}

class ReconciliationDatabase {
  constructor({ pool = null, connectionString = process.env.INGEST_DATABASE_URL } = {}) {
    if (!pool && !connectionString) throw new Error('INGEST_DATABASE_URL is required');
    this.pool = pool || new Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      query_timeout: 60000,
      application_name: 'outdoor-2026-4x100-reconciliation',
      ssl: process.env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
    this.ownsPool = !pool;
    this.eventTypeId = null;
    this.teamCatalog = null;
  }

  async close() {
    if (this.ownsPool) await this.pool.end();
  }

  async getEventTypeId() {
    if (this.eventTypeId) return this.eventTypeId;
    const { rows } = await this.pool.query(
      `SELECT event_type_id FROM public.event_types WHERE code = '4x100m' ORDER BY event_type_id LIMIT 1`
    );
    if (!rows[0]) throw new Error('event_types is missing the 4x100m event');
    this.eventTypeId = Number(rows[0].event_type_id);
    return this.eventTypeId;
  }

  async getMeet(meetId) {
    const { rows } = await this.pool.query(
      `SELECT m.meet_id, m.name, m.date::text, m.end_date::text, m.location, m.season,
              m.tfrrs_url, m.meet_url, m.results_status
        FROM public.meets m
       WHERE m.meet_id = $1
          AND (
            EXISTS (SELECT 1 FROM public.results r WHERE r.meet_id = m.meet_id)
            OR EXISTS (SELECT 1 FROM public.relay_results rr WHERE rr.meet_id = m.meet_id)
          )`,
      [meetId]
    );
    return rows[0] || null;
  }

  async listMeets({ season = 'Outdoor 2026', from = '2026-04-01', to = '2026-06-30' } = {}) {
    const { rows } = await this.pool.query(
      `SELECT m.meet_id, m.name, m.date::text, m.end_date::text, m.location, m.season,
              m.tfrrs_url, m.meet_url, m.results_status
         FROM public.meets m
        WHERE btrim(m.season) = $1
          AND m.date BETWEEN $2::date AND $3::date
          AND m.date < current_date
          AND (
            EXISTS (SELECT 1 FROM public.results r WHERE r.meet_id = m.meet_id)
            OR EXISTS (SELECT 1 FROM public.relay_results rr WHERE rr.meet_id = m.meet_id)
          )
        ORDER BY m.date, m.name, m.meet_id`,
      [season, from, to]
    );
    return rows;
  }

  async getTeamCatalog() {
    if (this.teamCatalog) return this.teamCatalog;
    const [{ rows: teams }, aliasResolver] = await Promise.all([
      this.pool.query(
        `SELECT t.team_id, t.gender, t.school_id, t.tfrrs_team_url,
                s.school_id AS canonical_school_id, s.official_name, s.short_name
           FROM public.teams t
           JOIN public.schools s ON s.school_id = t.school_id
          WHERE t.is_active IS DISTINCT FROM false`
      ),
      TeamAliasResolver.load(this.pool, 'tfrrs'),
    ]);
    this.teamCatalog = new TeamCatalog({ teams, aliasResolver });
    return this.teamCatalog;
  }

  async getLocalFacts(meetId) {
    const eventTypeId = await this.getEventTypeId();
    const { rows } = await this.pool.query(
      `SELECT rr.relay_result_id, rr.team_id, rr.mark_raw, rr.mark_seconds, rr.place, rr.round,
              t.team_id AS canonical_team_id, t.gender, t.school_id,
              s.school_id AS canonical_school_id, s.official_name, s.short_name,
              COALESCE(
                jsonb_agg(jsonb_build_object(
                  'athlete_id', ra.athlete_id,
                  'tfrrs_athlete_id', ra.tfrrs_athlete_id,
                  'athlete_name', ra.athlete_name,
                  'leg_order', ra.leg_order
                ) ORDER BY ra.leg_order) FILTER (WHERE ra.relay_athlete_id IS NOT NULL),
                '[]'::jsonb
              ) AS relay_athletes
         FROM public.relay_results rr
         LEFT JOIN public.teams t ON t.team_id = rr.team_id
         LEFT JOIN public.schools s ON s.school_id = t.school_id
         LEFT JOIN public.relay_athletes ra ON ra.relay_result_id = rr.relay_result_id
        WHERE rr.meet_id = $1
          AND rr.event_type_id = $2
        GROUP BY rr.relay_result_id, rr.team_id, rr.mark_raw, rr.mark_seconds, rr.place, rr.round,
                 t.team_id, t.gender, t.school_id, s.school_id, s.official_name, s.short_name
        ORDER BY rr.relay_result_id`,
      [meetId, eventTypeId]
    );
    return rows;
  }

  async prepareJobs({ scope, meets }) {
    if (!scope) throw new Error('scope is required');
    const eventTypeId = await this.getEventTypeId();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const meet of meets) {
        const relationship = classifyMeet(meet);
        const queueStatus = meet.tfrrs_url ? 'queued' : 'blocked';
        const reconciliationStatus = meet.tfrrs_url ? 'queued' : 'blocked';
        const payload = reconciliationPayload({
          scope,
          status: reconciliationStatus,
          queueState: queueStatus,
        });
        await client.query(
          `INSERT INTO ${QUEUE_TABLE} AS job
             (scope_key, meet_id, event_type_id, event_code, status, source_candidates,
              last_source, last_source_status, last_error, updated_at)
           VALUES ($1, $2, $3, '4x100m', $4,
                   jsonb_build_object('tfrrs_url', $5::text, '${RECONCILIATION_KEY}', $6::jsonb),
                   'tfrrs', 'unknown', $7, now())
           ON CONFLICT (scope_key, meet_id, event_type_id) DO UPDATE
             SET source_candidates = COALESCE(job.source_candidates, '{}'::jsonb)
                                    || jsonb_build_object('${RECONCILIATION_KEY}',
                                         COALESCE(job.source_candidates->'${RECONCILIATION_KEY}', EXCLUDED.source_candidates->'${RECONCILIATION_KEY}')),
                 last_source = 'tfrrs',
                 last_source_status = CASE
                   WHEN job.source_candidates ? '${RECONCILIATION_KEY}' THEN job.last_source_status
                   ELSE EXCLUDED.last_source_status
                 END,
                 last_error = CASE WHEN job.source_candidates ? '${RECONCILIATION_KEY}'
                                   THEN job.last_error ELSE EXCLUDED.last_error END,
                 updated_at = now()`,
          [
            scope,
            meet.meet_id,
            eventTypeId,
            queueStatus,
            meet.tfrrs_url || null,
            JSON.stringify({ ...payload, relationship_kind: relationship.kind }),
            queueStatus === 'blocked' ? 'missing_tfrrs_url' : null,
          ]
        );
      }
      await client.query('COMMIT');
      return meets.length;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async claimJob({ scope, leaseMinutes = 30, retryFailed = false, meetId = null } = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE ${QUEUE_TABLE}
            SET status = 'queued', lease_token = NULL, leased_until = NULL,
                last_error = COALESCE(last_error, 'recovered_expired_lease'), updated_at = now()
          WHERE scope_key = $1 AND status = 'in_progress' AND leased_until < now()`,
        [scope]
      );
      const { rows } = await client.query(
        `SELECT job.*
           FROM ${QUEUE_TABLE} job
          WHERE job.scope_key = $1
            AND (job.status = 'queued' OR ($2::boolean AND job.status = 'needs_review'
                 AND job.source_candidates #>> '{${RECONCILIATION_KEY},queue_state}' = 'failed'))
            AND job.next_attempt_at <= now()
            AND ($3::integer IS NULL OR job.meet_id = $3)
          ORDER BY job.priority, job.meet_id
          FOR UPDATE SKIP LOCKED
          LIMIT 1`,
        [scope, retryFailed, meetId]
      );
      if (!rows[0]) {
        await client.query('COMMIT');
        return null;
      }
      const token = cryptoRandomUuid();
      const { rows: claimed } = await client.query(
        `UPDATE ${QUEUE_TABLE}
            SET status = 'in_progress', lease_token = $2,
                leased_until = now() + ($3::integer * interval '1 minute'),
                source_candidates = jsonb_set(COALESCE(source_candidates, '{}'::jsonb),
                  '{${RECONCILIATION_KEY},queue_state}', '"in_progress"'::jsonb, true),
                attempts = attempts + 1, updated_at = now()
          WHERE job_id = $1
          RETURNING *`,
        [rows[0].job_id, token, leaseMinutes]
      );
      await client.query('COMMIT');
      return claimed[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async finishJob(job, result, actions = []) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const queueStatus = queueStatusForOutcome(result.status);
      const payload = reconciliationPayload({
        scope: job.scope_key,
        status: result.status,
        queueState: 'finished',
        result,
        actions,
      });
      const updated = await client.query(
        `UPDATE ${QUEUE_TABLE}
            SET status = $3,
                last_source = 'tfrrs',
                last_source_status = $4,
                source_candidates = jsonb_set(COALESCE(source_candidates, '{}'::jsonb),
                  '{${RECONCILIATION_KEY}}', $5::jsonb, true),
                last_error = NULL,
                lease_token = NULL,
                leased_until = NULL,
                updated_at = now()
          WHERE job_id = $1 AND lease_token = $2`,
        [
          job.job_id,
          job.lease_token,
          queueStatus,
          result.source_event_status,
          JSON.stringify(payload),
        ]
      );
      if (updated.rowCount !== 1) throw new Error(`job ${job.job_id} lost its lease before completion`);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async failJob(job, error) {
    await this.pool.query(
      `UPDATE ${QUEUE_TABLE}
          SET status = 'needs_review', last_error = $3,
              source_candidates = jsonb_set(COALESCE(source_candidates, '{}'::jsonb),
                '{${RECONCILIATION_KEY}}', $4::jsonb, true),
              lease_token = NULL, leased_until = NULL,
              next_attempt_at = now() + interval '10 minutes', updated_at = now()
        WHERE job_id = $1 AND lease_token = $2`,
      [
        job.job_id,
        job.lease_token,
        error?.message || String(error),
        JSON.stringify(reconciliationPayload({
          scope: job.scope_key,
          status: 'failed',
          queueState: 'failed',
          error: error?.message || String(error),
        })),
      ]
    );
  }

  async summary(scope) {
    const { rows } = await this.pool.query(
      `SELECT COALESCE(source_candidates #>> '{${RECONCILIATION_KEY},status}', status) AS status,
              count(*)::integer AS meets,
              sum(COALESCE((source_candidates #>> '{${RECONCILIATION_KEY},source_result_count}')::integer, 0))::integer AS source_results,
              sum(COALESCE((source_candidates #>> '{${RECONCILIATION_KEY},missing_result_count}')::integer, 0))::integer AS missing,
              sum(COALESCE((source_candidates #>> '{${RECONCILIATION_KEY},extra_result_count}')::integer, 0))::integer AS extra,
              sum(COALESCE((source_candidates #>> '{${RECONCILIATION_KEY},invalid_team_result_count}')::integer, 0))::integer AS invalid_team
         FROM ${QUEUE_TABLE}
        WHERE scope_key = $1
        GROUP BY COALESCE(source_candidates #>> '{${RECONCILIATION_KEY},status}', status)
        ORDER BY status`,
      [scope]
    );
    return rows;
  }
}

function cryptoRandomUuid() {
  return require('crypto').randomUUID();
}

module.exports = { ReconciliationDatabase };
