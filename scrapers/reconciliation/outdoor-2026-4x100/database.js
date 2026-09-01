const { Pool } = require('pg');
const { TeamAliasResolver } = require('../../shared/team_alias_resolver');
const { TeamCatalog, classifyMeet } = require('./domain');

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
          AND EXISTS (SELECT 1 FROM public.results r WHERE r.meet_id = m.meet_id)`,
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
          AND EXISTS (SELECT 1 FROM public.results r WHERE r.meet_id = m.meet_id)
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
        const status = meet.tfrrs_url ? 'queued' : 'blocked';
        await client.query(
          `INSERT INTO ingest.relay_4x100_reconciliation_jobs AS job
             (scope_key, meet_id, event_type_id, source, source_url, relationship_kind,
              source_event_status, status, last_error, updated_at)
           VALUES ($1, $2, $3, 'tfrrs', $4, $5, 'unknown', $6, $7, now())
           ON CONFLICT (scope_key, meet_id, event_type_id) DO UPDATE
             SET source_url = EXCLUDED.source_url,
                 relationship_kind = CASE
                   WHEN job.relationship_kind IN ('combined_child', 'duplicate')
                     THEN job.relationship_kind
                   ELSE EXCLUDED.relationship_kind
                 END,
                 status = CASE
                   WHEN job.status IN ('matched', 'not_contested', 'child') THEN job.status
                   ELSE EXCLUDED.status
                 END,
                 last_error = CASE
                   WHEN EXCLUDED.status = 'blocked' THEN EXCLUDED.last_error
                   ELSE NULL
                 END,
                 updated_at = now()`,
          [
            scope,
            meet.meet_id,
            eventTypeId,
            meet.tfrrs_url || null,
            relationship.kind,
            status,
            status === 'blocked' ? 'missing_tfrrs_url' : null,
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
        `UPDATE ingest.relay_4x100_reconciliation_jobs
            SET status = 'queued', lease_token = NULL, leased_until = NULL,
                last_error = COALESCE(last_error, 'recovered_expired_lease'), updated_at = now()
          WHERE scope_key = $1 AND status = 'in_progress' AND leased_until < now()`,
        [scope]
      );
      const { rows } = await client.query(
        `SELECT job.*
           FROM ingest.relay_4x100_reconciliation_jobs job
          WHERE job.scope_key = $1
            AND (job.status = 'queued' OR ($2::boolean AND job.status = 'failed'))
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
        `UPDATE ingest.relay_4x100_reconciliation_jobs
            SET status = 'in_progress', lease_token = $2,
                leased_until = now() + ($3::integer * interval '1 minute'),
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
      const updated = await client.query(
        `UPDATE ingest.relay_4x100_reconciliation_jobs
            SET relationship_kind = $3,
                source_event_status = $4,
                status = $5,
                source_event_count = $6,
                source_result_count = $7,
                local_result_count = $8,
                matched_result_count = $9,
                missing_result_count = $10,
                extra_result_count = $11,
                invalid_team_result_count = $12,
                unresolved_source_team_count = $13,
                diff = $14::jsonb,
                last_error = CASE WHEN $5 IN ('failed', 'blocked') THEN $15 ELSE NULL END,
                lease_token = NULL,
                leased_until = NULL,
                verified_at = CASE WHEN $5 IN ('matched', 'not_contested', 'child', 'repair_ready', 'needs_review') THEN now() ELSE verified_at END,
                updated_at = now()
          WHERE job_id = $1 AND lease_token = $2`,
        [
          job.job_id,
          job.lease_token,
          result.relationship.kind,
          result.source_event_status,
          result.status,
          result.source_event_count,
          result.source_result_count,
          result.local_result_count,
          result.matched_result_count,
          result.missing_result_count,
          result.extra_result_count,
          result.invalid_team_result_count,
          result.unresolved_source_team_count,
          JSON.stringify(result.diff),
          result.reason,
        ]
      );
      if (updated.rowCount !== 1) throw new Error(`job ${job.job_id} lost its lease before completion`);
      await client.query(
        `UPDATE ingest.relay_4x100_reconciliation_actions
            SET status = 'rejected', reviewed_at = now()
          WHERE job_id = $1 AND status = 'planned'`,
        [job.job_id]
      );
      for (const action of actions) {
        await client.query(
          `INSERT INTO ingest.relay_4x100_reconciliation_actions
             (job_id, action_type, source_record_key, local_relay_result_id,
              source_payload, reason, confidence, status)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'planned')
           ON CONFLICT (
             job_id, action_type, (COALESCE(source_record_key, '')),
             (COALESCE(local_relay_result_id, 0))
           ) DO UPDATE
             SET source_payload = EXCLUDED.source_payload,
                 reason = EXCLUDED.reason,
                 confidence = EXCLUDED.confidence,
                 status = 'planned',
                 reviewed_at = NULL`,
          [
            job.job_id,
            action.action_type,
            action.source_record_key,
            action.local_relay_result_id,
            JSON.stringify(action.source_payload || {}),
            action.reason,
            action.confidence,
          ]
        );
      }
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
      `UPDATE ingest.relay_4x100_reconciliation_jobs
          SET status = 'failed', last_error = $3, lease_token = NULL, leased_until = NULL,
              next_attempt_at = now() + interval '10 minutes', updated_at = now()
        WHERE job_id = $1 AND lease_token = $2`,
      [job.job_id, job.lease_token, error?.message || String(error)]
    );
  }

  async summary(scope) {
    const { rows } = await this.pool.query(
      `SELECT status, count(*)::integer AS meets,
              sum(source_result_count)::integer AS source_results,
              sum(missing_result_count)::integer AS missing,
              sum(extra_result_count)::integer AS extra,
              sum(invalid_team_result_count)::integer AS invalid_team
         FROM ingest.relay_4x100_reconciliation_jobs
        WHERE scope_key = $1
        GROUP BY status
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
