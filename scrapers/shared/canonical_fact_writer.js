/**
 * Transactional writer for the canonical public fact tables.
 *
 * Source adapters never write results directly. They normalize source rows, persist those rows in
 * the private ingest schema, and this writer makes the only insert/claim/link decision. The
 * writer deliberately favors a reviewable quarantine over a guessed merge.
 */

const { matchObservation, keyForSourceRecord } = require('./result_matcher');
const { Pool } = require('pg');
const { queryTimeoutFromEnv } = require('./ingestion_store');
const { sourceCorrectionFields } = require('./source_correction');

function connectionStringFromEnv(env = process.env) {
  // Canonical fact writes require an explicit private ingestion connection. Never infer the
  // target from a generic application DATABASE_URL.
  return env.INGEST_DATABASE_URL || null;
}

function chunk(items, size = 500) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function keyForObservation(observation) {
  const actor = observation.entity_type === 'relay_result'
    ? observation.target_team_id
    : observation.target_athlete_id;
  // Relay legs are stored as individual rows in public.results, so they share the individual
  // candidate pool for matching even though their provenance entity_type remains relay_leg.
  const candidateEntity = observation.entity_type === 'relay_result' ? 'relay_result' : 'individual_result';
  return `${candidateEntity}|${actor || ''}|${observation.event_type_id || ''}`;
}

function rememberLinkedSource(set, row) {
  set.add(keyForSourceRecord(row));
}

function promotionLockKeys(rows) {
  const keys = new Set();
  for (const row of rows) {
    if (row.source_record_id) keys.add(`trackhub:fact:source:${row.source_record_id}`);
    if (row.target_meet_id) keys.add(`trackhub:fact:meet:${row.target_meet_id}`);
    // History claims can compete across meets, so a meet lock alone is insufficient.
    if (row.target_athlete_id && row.event_type_id) {
      keys.add(`trackhub:fact:athlete:${row.target_athlete_id}:event:${row.event_type_id}`);
    }
  }
  return [...keys].sort();
}

function sourcePayload(row) {
  return row.payload && typeof row.payload === 'object' ? row.payload : {};
}

function nullableInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function linkedTarget(resultId, relayResultId) {
  const result = nullableInteger(resultId);
  const relay = nullableInteger(relayResultId);
  if (result && !relay) return { resultId: result, relayResultId: null };
  if (relay && !result) return { resultId: null, relayResultId: relay };
  return null;
}

function asObservation(row) {
  return {
    source: row.source,
    entity_type: row.entity_type,
    source_record_key: row.source_record_key,
    target_meet_id: row.target_meet_id,
    target_athlete_id: row.target_athlete_id,
    target_team_id: row.target_team_id,
    event_type_id: row.event_type_id,
    raw_event_name: row.raw_event_name,
    measure: row.measure,
    mark_raw: row.mark_raw,
    mark_seconds: row.mark_seconds,
    mark_meters: row.mark_meters,
    points: row.points,
    place: row.place,
    round: row.round,
    result_date: row.result_date,
    performance_key: row.performance_key,
    canonical_key: row.canonical_key,
    relay_athletes: sourcePayload(row).relay_athletes || [],
    validation_errors: row.validation_errors || []
  };
}

function candidateKey(observation) {
  return keyForObservation(observation);
}

class CanonicalFactWriter {
  constructor({ pool, env = process.env, historyWindowDays = 7, statementTimeoutMs = null } = {}) {
    const connectionString = connectionStringFromEnv(env);
    if (!pool && !connectionString) {
      throw new Error('INGEST_DATABASE_URL is required for the canonical fact writer');
    }
    this.pool = pool || new Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      query_timeout: queryTimeoutFromEnv(env),
      application_name: 'trackhub-canonical-writer',
      ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    this.ownsPool = !pool;
    this.historyWindowDays = historyWindowDays;
    if (statementTimeoutMs != null && (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs <= 0)) {
      throw new Error('statementTimeoutMs must be a positive integer');
    }
    this.statementTimeoutMs = statementTimeoutMs;
  }

  /**
   * Commit all valid observations for one run. Invalid observations are recorded in quarantine;
   * they never abort an otherwise valid batch. A database error does abort the whole transaction.
   */
  async commitRun(runId) {
    if (!runId) throw new Error('runId is required');
    const client = await this.pool.connect();
    const stats = {
      observations: 0,
      inserted: 0,
      claimed: 0,
      skipped: 0,
      quarantined: 0,
      errors: 0,
      relayParents: 0,
      relayLegs: 0
    };

    try {
      await client.query('BEGIN');
      if (this.statementTimeoutMs != null) {
        // The value is validated as an integer before interpolation. SET LOCAL keeps the
        // longer budget scoped to this atomic promotion transaction only.
        await client.query(`SET LOCAL statement_timeout = ${this.statementTimeoutMs}`);
      }

      const scope = await client.query(
        `SELECT source_record_id, target_meet_id, target_athlete_id, event_type_id
           FROM ingest.observations WHERE run_id = $1
            AND decision IN ('pending', 'insert', 'claim', 'quarantine')`, [runId]
      );
      const lockKeys = promotionLockKeys(scope.rows);
      if (lockKeys.length) {
        // Acquire in numeric hash order in one round trip. Both the candidate reads and source
        // link reads below must happen AFTER the lock wait, under READ COMMITTED snapshots.
        await client.query(
          `SELECT pg_advisory_xact_lock(lock_id)
             FROM (SELECT DISTINCT hashtextextended(scope, 0) AS lock_id
                     FROM unnest($1::text[]) AS scopes(scope)) AS locks
            ORDER BY lock_id`, [lockKeys]
        );
      }

      const { rows } = await client.query(
        `SELECT o.*, sr.source_record_id, sr.source_record_key, sv.payload,
                et.code AS event_code,
                m.name AS meet_name,
                m.date AS meet_canonical_date,
                sl.result_id AS linked_result_id,
                sl.entity_type AS linked_entity_type,
                sl.relay_result_id AS linked_relay_result_id,
                CASE WHEN sl.result_id IS NOT NULL THEN to_jsonb(linked_individual)
                     WHEN sl.relay_result_id IS NOT NULL THEN to_jsonb(linked_relay)
                END AS linked_fact
           FROM ingest.observations o
           JOIN ingest.source_records sr ON sr.source_record_id = o.source_record_id
           LEFT JOIN ingest.source_record_versions sv
             ON sv.source_record_id = o.source_record_id AND sv.snapshot_hash = o.source_snapshot_hash
           LEFT JOIN public.event_types et ON et.event_type_id = o.event_type_id
           LEFT JOIN public.meets m ON m.meet_id = o.target_meet_id
           LEFT JOIN ingest.source_links sl ON sl.source_record_id = o.source_record_id
           LEFT JOIN public.results linked_individual ON linked_individual.result_id = sl.result_id
           LEFT JOIN public.relay_results linked_relay ON linked_relay.relay_result_id = sl.relay_result_id
          WHERE o.run_id = $1
            AND o.decision IN ('pending', 'insert', 'claim', 'quarantine')
          ORDER BY o.observation_id
          FOR UPDATE OF o`,
        [runId]
      );
      stats.observations = rows.length;

      if (!rows.length) {
        await client.query('COMMIT');
        return stats;
      }

      // Legacy observations have no provable raw snapshot. Keep prior fact links, but never
      // reconstruct a result or relay lineup from another run's mutable latest payload.
      for (let index = rows.length - 1; index >= 0; index--) {
        const row = rows[index];
        if (row.source_snapshot_hash !== null) continue;
        if (row.linked_result_id || row.linked_relay_result_id) {
          await this.markObservation(client, row.observation_id, 'skip_duplicate',
            'source_record_already_linked', 1, row.linked_result_id || null, row.linked_relay_result_id || null);
          stats.skipped++;
        } else {
          await this.quarantine(client, row.observation_id, 'missing_source_snapshot', null);
          stats.quarantined++;
        }
        rows.splice(index, 1);
      }

      const preclassifiedQuarantines = rows.filter(row => row.decision === 'quarantine');
      stats.quarantined += await this.quarantineExistingRows(client, preclassifiedQuarantines);

      // A source identity is not proof that a changed performance is an exact replay. Keep
      // the linked public fact and both evidence versions; require explicit correction review.
      for (let index = rows.length - 1; index >= 0; index--) {
        const row = rows[index];
        if (row.decision === 'quarantine' || !(row.linked_result_id || row.linked_relay_result_id)) continue;
        const differences = sourceCorrectionFields(row);
        if (!differences.length) continue;
        await this.quarantine(client, row.observation_id, 'source_correction_required', 0);
        stats.quarantined++;
        rows.splice(index, 1);
      }

      const meetIds = [...new Set(rows.map(r => r.target_meet_id).filter(Boolean))];
      const athleteIds = [...new Set(rows.map(r => r.target_athlete_id).filter(Boolean))];
      const teamIds = [...new Set(rows.map(r => r.target_team_id).filter(Boolean))];
      const eventTypeIds = [...new Set(rows.map(r => r.event_type_id).filter(Boolean))];

      const [individuals, relays] = await Promise.all([
        client.query(
          `SELECT result_id, meet_id, athlete_id, team_id, event_type_id, mark_raw,
                  mark_seconds, mark_meters, place, round, date
             FROM public.results
            WHERE event_type_id = ANY($1::integer[])
              AND athlete_id = ANY($2::bigint[])
              AND (meet_id = ANY($3::integer[]) OR meet_id IS NULL)`,
          [eventTypeIds, athleteIds, meetIds]
        ),
        client.query(
          `SELECT relay_result_id, meet_id, team_id, event_type_id, mark_raw,
                  mark_seconds, place, round, date
             FROM public.relay_results
            WHERE event_type_id = ANY($1::integer[])
              AND team_id = ANY($2::integer[])
              AND meet_id = ANY($3::integer[])`,
          [eventTypeIds, teamIds.map(Number), meetIds]
        )
      ]);

      // Load lineup identity only for the relay candidates above. The lookup is used solely for
      // duplicate matching; it never authorizes a new write.
      if (relays.rows.length) {
        const { rows: lineupRows } = await client.query(
          `SELECT relay_result_id, athlete_id, tfrrs_athlete_id, athlete_name, leg_order
             FROM public.relay_athletes
            WHERE relay_result_id = ANY($1::integer[])`,
          [relays.rows.map(row => Number(row.relay_result_id))]
        );
        const lineups = new Map();
        for (const leg of lineupRows) {
          if (!lineups.has(leg.relay_result_id)) lineups.set(leg.relay_result_id, []);
          lineups.get(leg.relay_result_id).push(leg);
        }
        for (const relay of relays.rows) {
          relay.relay_athletes = lineups.get(relay.relay_result_id) || [];
        }
      }

      const candidates = new Map();
      for (const row of individuals.rows) {
        const key = `individual_result|${row.athlete_id}|${row.event_type_id}`;
        if (!candidates.has(key)) candidates.set(key, []);
        candidates.get(key).push(row);
      }
      for (const row of relays.rows) {
        const key = `relay_result|${row.team_id}|${row.event_type_id}`;
        if (!candidates.has(key)) candidates.set(key, []);
        candidates.get(key).push(row);
      }

      const linkedSourceKeys = new Set();
      for (const row of rows) {
        if (row.linked_result_id || row.linked_relay_result_id) {
          rememberLinkedSource(linkedSourceKeys, row);
        }
      }

      // Historical 4x100 recovery runs contain only relay parents and relay legs. Their old
      // generic path performed several network round trips per row, which made a single large
      // meet hold a transaction open for minutes. Classify those rows in memory, then use a few
      // set-based statements for the actual public writes. The generic path below remains the
      // fallback for mixed/individual imports.
      if (rows.length && rows.every(row => row.entity_type === 'relay_result' || row.entity_type === 'relay_leg')) {
        await this.commitRelayBatch(client, rows, candidates, linkedSourceKeys, stats);
        await client.query('COMMIT');
        return stats;
      }

      for (const row of rows) {
        const observation = asObservation(row);
        const existing = candidates.get(candidateKey(observation)) || [];

        if (row.decision === 'quarantine') {
          // Preclassified quarantine rows are persisted in one batch before this loop.
          continue;
        }

        // A replay of a source record that was linked by an earlier run must resolve to the exact
        // prior fact, even if the source parser now emits a different annotation or round label.
        if (row.linked_result_id || row.linked_relay_result_id) {
          const resultId = row.linked_result_id || null;
          const relayId = row.linked_relay_result_id || null;
          if (observation.entity_type === 'relay_leg') {
            await this.reconcileRelayLeg(client, row);
          }
          await this.markObservation(client, row.observation_id, 'skip_duplicate',
            'source_record_already_linked', 1, resultId, relayId);
          stats.skipped++;
          rememberLinkedSource(linkedSourceKeys, row);
          continue;
        }

        // A source record that was linked by a previous run is idempotent even if its observation
        // was staged again with a different parser version.
        const match = matchObservation(observation, existing, {
          seenSourceKeys: linkedSourceKeys,
          historyWindowDays: this.historyWindowDays
        });

        if (match.action === 'quarantine') {
          await this.quarantine(client, row.observation_id, match.reason, match.confidence);
          stats.quarantined++;
          continue;
        }

        if (match.action === 'skip_duplicate' || match.action === 'claim') {
          const existingRow = match.matched;
          const target = linkedTarget(existingRow?.result_id, existingRow?.relay_result_id);
          if (!target) {
            await this.quarantine(client, row.observation_id, 'matched_without_target', 0);
            stats.quarantined++;
            continue;
          }

          if (match.action === 'claim' && existingRow.meet_id == null && row.target_meet_id) {
            await client.query(
              `UPDATE public.results
                  SET meet_id = $2
                WHERE result_id = $1 AND meet_id IS NULL`,
              [target.resultId, row.target_meet_id]
            );
            stats.claimed++;
          } else {
            stats.skipped++;
          }

          if (observation.entity_type === 'relay_leg') {
            await this.reconcileRelayLeg(client, row);
          }
          await this.linkSource(client, row, target.resultId, target.relayResultId);
          await this.markObservation(client, row.observation_id, match.action, match.reason,
            match.confidence, target.resultId, target.relayResultId);
          rememberLinkedSource(linkedSourceKeys, row);
          continue;
        }

        if (observation.entity_type === 'relay_result') {
          const relayId = await this.insertRelay(client, row);
          if (!relayId) {
            await this.quarantine(client, row.observation_id, 'relay_insert_conflict', 0.25);
            stats.quarantined++;
            continue;
          }
          await this.linkSource(client, row, null, relayId);
          await this.markObservation(client, row.observation_id, 'insert', 'new_canonical_relay',
            1, null, relayId);
          stats.inserted++;
          stats.relayParents++;
          rememberLinkedSource(linkedSourceKeys, row);

          await this.insertRelayAthletes(client, row, relayId);

          const inserted = {
            relay_result_id: relayId,
            meet_id: row.target_meet_id,
            team_id: row.target_team_id,
            event_type_id: row.event_type_id,
            mark_raw: row.mark_raw,
            mark_seconds: row.mark_seconds,
            place: row.place,
            round: row.round,
            date: row.result_date
          };
          const key = candidateKey(observation);
          if (!candidates.has(key)) candidates.set(key, []);
          candidates.get(key).push(inserted);
          continue;
        }

        const resultId = await this.insertResult(client, row);
        if (!resultId) {
          await this.quarantine(client, row.observation_id, 'result_insert_conflict', 0.25);
          stats.quarantined++;
          continue;
        }

        await this.linkSource(client, row, resultId, null);
        if (observation.entity_type === 'relay_leg') {
          await this.reconcileRelayLeg(client, row);
        }
        await this.markObservation(client, row.observation_id, 'insert',
          observation.entity_type === 'relay_leg' ? 'new_relay_leg_result' : 'new_canonical_result',
          1, resultId, null);
        stats.inserted++;
        if (observation.entity_type === 'relay_leg') stats.relayLegs++;
        rememberLinkedSource(linkedSourceKeys, row);

        const inserted = {
          result_id: resultId,
          meet_id: row.target_meet_id,
          athlete_id: row.target_athlete_id,
          team_id: row.target_team_id,
          event_type_id: row.event_type_id,
          mark_raw: row.mark_raw,
          mark_seconds: row.mark_seconds,
          mark_meters: row.mark_meters,
          place: row.place,
          round: row.round,
          date: row.result_date
        };
        const key = candidateKey(observation);
        if (!candidates.has(key)) candidates.set(key, []);
        candidates.get(key).push(inserted);
      }

      await client.query('COMMIT');
      return stats;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async commitRelayBatch(client, rows, candidates, linkedSourceKeys, stats) {
    const quarantines = [];
    const claims = [];
    const links = [];
    const marks = [];
    const reconcileLegs = [];
    const newParents = [];
    const newLegs = [];
    const pendingParentKeys = new Set();
    const pendingLegKeys = new Set();

    const mark = (row, decision, reason, confidence, resultId = null, relayId = null) => {
      marks.push({
        observation_id: row.observation_id,
        decision,
        reason,
        confidence,
        result_id: resultId,
        relay_result_id: relayId,
      });
    };

    const link = (row, resultId = null, relayId = null) => {
      links.push({
        source_record_id: row.source_record_id,
        entity_type: row.entity_type,
        result_id: resultId,
        relay_result_id: relayId,
      });
    };

    const parentIdentity = row => [
      row.target_team_id,
      row.event_type_id,
      row.mark_raw,
      row.mark_seconds,
      row.place,
      row.target_meet_id,
      row.event_id || null,
      row.result_date,
      row.round || null,
    ].map(value => value == null ? '' : String(value)).join('|');

    const legIdentity = row => [
      row.target_athlete_id,
      row.target_team_id,
      row.event_type_id,
      row.mark_raw,
      row.mark_seconds,
      row.target_meet_id,
      row.event_id || null,
      row.result_date,
      row.round || null,
    ].map(value => value == null ? '' : String(value)).join('|');

    for (const row of rows) {
      if (row.decision === 'quarantine') continue;
      const observation = asObservation(row);

      if (row.linked_result_id || row.linked_relay_result_id) {
        const target = linkedTarget(row.linked_result_id, row.linked_relay_result_id);
        if (!target) {
          quarantines.push({ observation_id: row.observation_id, reason: 'linked_without_target', confidence: 0 });
          continue;
        }
        mark(row, 'skip_duplicate', 'source_record_already_linked', 1, target.resultId, target.relayResultId);
        if (row.entity_type === 'relay_leg') reconcileLegs.push(row);
        stats.skipped++;
        continue;
      }

      const existing = candidates.get(candidateKey(observation)) || [];
      const match = matchObservation(observation, existing, {
        seenSourceKeys: linkedSourceKeys,
        historyWindowDays: this.historyWindowDays,
      });

      if (match.action === 'quarantine') {
        quarantines.push({
          observation_id: row.observation_id,
          reason: match.reason,
          confidence: match.confidence,
        });
        continue;
      }

      if (match.action === 'skip_duplicate' || match.action === 'claim') {
        const target = linkedTarget(match.matched?.result_id, match.matched?.relay_result_id);
        if (!target) {
          quarantines.push({ observation_id: row.observation_id, reason: 'matched_without_target', confidence: 0 });
          continue;
        }
        if (match.action === 'claim' && match.matched.meet_id == null && target.resultId) {
          claims.push({ result_id: target.resultId, meet_id: row.target_meet_id });
          stats.claimed++;
        } else {
          stats.skipped++;
        }
        link(row, target.resultId, target.relayResultId);
        mark(row, match.action, match.reason, match.confidence, target.resultId, target.relayResultId);
        rememberLinkedSource(linkedSourceKeys, row);
        if (row.entity_type === 'relay_leg') reconcileLegs.push(row);
        continue;
      }

      if (row.entity_type === 'relay_result') {
        const key = parentIdentity(row);
        if (pendingParentKeys.has(key)) {
          quarantines.push({ observation_id: row.observation_id, reason: 'duplicate_within_run', confidence: 1 });
          continue;
        }
        pendingParentKeys.add(key);
        newParents.push(row);
        continue;
      }

      const key = legIdentity(row);
      if (pendingLegKeys.has(key)) {
        quarantines.push({ observation_id: row.observation_id, reason: 'duplicate_within_run', confidence: 1 });
        continue;
      }
      pendingLegKeys.add(key);
      newLegs.push(row);
    }

    if (quarantines.length) {
      const payload = JSON.stringify(quarantines);
      await client.query(
        `UPDATE ingest.observations o
            SET decision = 'quarantine',
                decision_reason = v.reason,
                confidence = v.confidence
           FROM jsonb_to_recordset($1::jsonb)
             AS v(observation_id bigint, reason text, confidence numeric)
          WHERE o.observation_id = v.observation_id`,
        [payload]
      );
      await client.query(
        `INSERT INTO ingest.quarantine (observation_id, reason_code, status)
         SELECT v.observation_id, v.reason, 'open'
           FROM jsonb_to_recordset($1::jsonb)
             AS v(observation_id bigint, reason text, confidence numeric)
         ON CONFLICT (observation_id) DO UPDATE
           SET reason_code = EXCLUDED.reason_code,
               status = 'open',
               resolved_at = NULL`,
        [payload]
      );
      stats.quarantined += quarantines.length;
    }

    const parentBySourceKey = new Map();
    if (newParents.length) {
      await client.query(
        `CREATE TEMP TABLE pg_temp.recovery_relay_parents (
           source_record_id bigint PRIMARY KEY,
           team_id integer,
           event_name text,
           mark_raw text,
           mark_seconds numeric,
           place integer,
           meet_name text,
           meet_id integer,
           event_id integer,
           result_date date,
           round text,
           event_type_id integer
         ) ON COMMIT DROP`
      );
      await client.query(
        `INSERT INTO pg_temp.recovery_relay_parents
           (source_record_id, team_id, event_name, mark_raw, mark_seconds, place, meet_name,
            meet_id, event_id, result_date, round, event_type_id)
         SELECT source_record_id, team_id, event_name, mark_raw, mark_seconds, place, meet_name,
                meet_id, event_id, result_date, round, event_type_id
           FROM jsonb_to_recordset($1::jsonb)
             AS v(source_record_id bigint, team_id integer, event_name text, mark_raw text,
                  mark_seconds numeric, place integer, meet_name text, meet_id integer,
                  event_id integer, result_date date, round text, event_type_id integer)`,
        [JSON.stringify(newParents.map(row => ({
          source_record_id: row.source_record_id,
          team_id: row.target_team_id,
          event_name: row.event_code || row.raw_event_name,
          mark_raw: row.mark_raw,
          mark_seconds: row.mark_seconds,
          place: row.place,
          meet_name: row.meet_name,
          meet_id: row.target_meet_id,
          event_id: nullableInteger(sourcePayload(row).event_id),
          result_date: row.result_date,
          round: row.round,
          event_type_id: row.event_type_id,
        })))]
      );
      await client.query(
        `INSERT INTO public.relay_results
           (team_id, event_name, mark_raw, mark_seconds, place, meet_name, meet_id,
            event_id, date, round, event_type_id)
         SELECT team_id, event_name, mark_raw, mark_seconds, place, meet_name, meet_id,
                event_id, result_date, round, event_type_id
           FROM pg_temp.recovery_relay_parents
         ON CONFLICT DO NOTHING`
      );
      const { rows: parentIds } = await client.query(
        `SELECT p.source_record_id, rr.relay_result_id
           FROM pg_temp.recovery_relay_parents p
           JOIN public.relay_results rr
             ON rr.meet_id = p.meet_id
            AND rr.event_type_id = p.event_type_id
            AND rr.team_id = p.team_id
            AND rr.mark_raw = p.mark_raw
            AND (rr.mark_seconds = p.mark_seconds
              OR (rr.mark_seconds IS NULL AND p.mark_seconds IS NULL))
            AND (rr.place = p.place OR (rr.place IS NULL AND p.place IS NULL))
            AND (rr.event_id = p.event_id OR (rr.event_id IS NULL AND p.event_id IS NULL))
            AND (rr.date = p.result_date OR (rr.date IS NULL AND p.result_date IS NULL))
            AND (rr.round = p.round OR (rr.round IS NULL AND p.round IS NULL))`,
      );
      for (const row of parentIds) parentBySourceKey.set(String(row.source_record_id), Number(row.relay_result_id));
      if (parentBySourceKey.size !== newParents.length) {
        throw new Error(`relay batch insert returned ${parentBySourceKey.size} of ${newParents.length} parent IDs`);
      }

      const relayAthletes = [];
      for (const row of newParents) {
        const relayId = parentBySourceKey.get(String(row.source_record_id));
        const payload = sourcePayload(row);
        for (const [index, leg] of (payload.relay_athletes || []).entries()) {
          relayAthletes.push({
            relay_result_id: relayId,
            athlete_id: leg?.athlete_id || leg?.target_athlete_id || null,
            tfrrs_athlete_id: leg?.tfrrs_athlete_id || null,
            athlete_name: leg?.athlete_name || leg?.name || null,
            leg_order: leg?.leg_order || index + 1,
          });
        }
        link(row, null, relayId);
        mark(row, 'insert', 'new_canonical_relay', 1, null, relayId);
        stats.inserted++;
        stats.relayParents++;
        rememberLinkedSource(linkedSourceKeys, row);
      }
      if (relayAthletes.length) {
        await client.query(
          `INSERT INTO public.relay_athletes
             (relay_result_id, athlete_id, tfrrs_athlete_id, athlete_name, leg_order)
           SELECT relay_result_id, athlete_id, tfrrs_athlete_id, athlete_name, leg_order
             FROM jsonb_to_recordset($1::jsonb)
               AS v(relay_result_id integer, athlete_id integer, tfrrs_athlete_id text,
                    athlete_name text, leg_order integer)`,
          [JSON.stringify(relayAthletes)]
        );
      }
    }

    const legBySourceKey = new Map();
    if (newLegs.length) {
      await client.query(
        `CREATE TEMP TABLE pg_temp.recovery_relay_legs (
           observation_id bigint PRIMARY KEY,
           source_record_id bigint,
           athlete_id integer,
           team_id integer,
           event_name text,
           mark_raw text,
           mark_seconds numeric,
           mark_meters numeric,
           place integer,
           meet_name text,
           meet_id integer,
           event_id integer,
           result_date date,
           round text,
           event_type_id integer
         ) ON COMMIT DROP`
      );
      const legPayload = newLegs.map(row => ({
        observation_id: row.observation_id,
        source_record_id: row.source_record_id,
        athlete_id: row.target_athlete_id,
        team_id: row.target_team_id,
        event_name: row.event_code || row.raw_event_name,
        mark_raw: row.mark_raw,
        mark_seconds: row.mark_seconds,
        mark_meters: row.mark_meters,
        place: row.place,
        meet_name: row.meet_name,
        meet_id: row.target_meet_id,
        event_id: nullableInteger(sourcePayload(row).event_id),
        result_date: row.result_date,
        round: row.round,
        event_type_id: row.event_type_id,
      }));
      await client.query(
        `INSERT INTO pg_temp.recovery_relay_legs
           (observation_id, source_record_id, athlete_id, team_id, event_name, mark_raw,
            mark_seconds, mark_meters, place, meet_name, meet_id, event_id, result_date,
            round, event_type_id)
         SELECT observation_id, source_record_id, athlete_id, team_id, event_name, mark_raw,
                mark_seconds, mark_meters, place, meet_name, meet_id, event_id, result_date,
                round, event_type_id
           FROM jsonb_to_recordset($1::jsonb)
             AS v(observation_id bigint, source_record_id bigint, athlete_id integer,
                 team_id integer, event_name text, mark_raw text, mark_seconds numeric,
                 mark_meters numeric, place integer, meet_name text, meet_id integer,
                 event_id integer, result_date date, round text, event_type_id integer)`,
        [JSON.stringify(legPayload)]
      );
      await client.query(
        `INSERT INTO public.results
           (athlete_id, team_id, event_name, mark_raw, mark_seconds, mark_meters, mark_feet,
            wind, round, date, season_code, meet_name, meet_location, place, total_competitors,
            is_pr, is_season_best, meet_id, event_id, event_type_id, environment)
         SELECT athlete_id, team_id, event_name, mark_raw, mark_seconds, mark_meters, NULL,
                NULL, round, result_date, NULL, meet_name, NULL, place, NULL,
                false, false, meet_id, event_id, event_type_id, NULL
           FROM pg_temp.recovery_relay_legs
         ON CONFLICT DO NOTHING`
      );
      const { rows: legIds } = await client.query(
        `SELECT l.source_record_id, l.observation_id, r.result_id
           FROM pg_temp.recovery_relay_legs l
           JOIN public.results r
             ON r.meet_id = l.meet_id
            AND r.event_type_id = l.event_type_id
            AND r.athlete_id = l.athlete_id
            AND r.mark_raw = l.mark_raw
            AND (r.team_id = l.team_id OR (r.team_id IS NULL AND l.team_id IS NULL))
            AND (r.mark_seconds = l.mark_seconds
              OR (r.mark_seconds IS NULL AND l.mark_seconds IS NULL))
            AND (r.mark_meters = l.mark_meters
              OR (r.mark_meters IS NULL AND l.mark_meters IS NULL))
            AND (r.place = l.place OR (r.place IS NULL AND l.place IS NULL))
            AND (r.event_id = l.event_id OR (r.event_id IS NULL AND l.event_id IS NULL))
            AND (r.round = l.round OR (r.round IS NULL AND l.round IS NULL))`,
      );
      if (legIds.length !== newLegs.length) {
        throw new Error(`relay leg batch insert returned ${legIds.length} of ${newLegs.length} result IDs`);
      }
      for (const row of legIds) legBySourceKey.set(String(row.source_record_id), Number(row.result_id));
      for (const row of newLegs) {
        const resultId = legBySourceKey.get(String(row.source_record_id));
        link(row, resultId, null);
        mark(row, 'insert', 'new_relay_leg_result', 1, resultId, null);
        stats.inserted++;
        stats.relayLegs++;
        rememberLinkedSource(linkedSourceKeys, row);
        reconcileLegs.push(row);
      }
    }

    if (claims.length) {
      await client.query(
        `UPDATE public.results r
            SET meet_id = v.meet_id
           FROM jsonb_to_recordset($1::jsonb)
             AS v(result_id bigint, meet_id integer)
          WHERE r.result_id = v.result_id
            AND r.meet_id IS NULL`,
        [JSON.stringify(claims)]
      );
    }

    // Parent/leg reconciliation joins source_links, so publish the links before resolving any
    // newly matched leg identities.
    if (links.length) {
      await client.query(
        `INSERT INTO ingest.source_links
           (source_record_id, entity_type, result_id, relay_result_id, link_status,
            first_linked_at, last_seen_at)
         SELECT source_record_id, entity_type, result_id, relay_result_id, 'linked', now(), now()
           FROM jsonb_to_recordset($1::jsonb)
             AS v(source_record_id bigint, entity_type text, result_id bigint, relay_result_id bigint)
         ON CONFLICT (source_record_id) DO UPDATE
           SET entity_type = EXCLUDED.entity_type,
               result_id = EXCLUDED.result_id,
               relay_result_id = EXCLUDED.relay_result_id,
               link_status = 'linked',
               last_seen_at = now()`,
        [JSON.stringify(links)]
      );
    }

    if (reconcileLegs.length) {
      await client.query(
        `WITH legs AS (
          SELECT source, parent_source_record_key, target_athlete_id, leg_order, source_athlete_key
            FROM jsonb_to_recordset($1::jsonb)
              AS v(source text, parent_source_record_key text, target_athlete_id integer,
                   leg_order integer, source_athlete_key text)
        )
        UPDATE public.relay_athletes ra
           SET athlete_id = legs.target_athlete_id
          FROM legs
          JOIN ingest.source_records sr
            ON sr.source = legs.source
           AND sr.source_record_key = legs.parent_source_record_key
          JOIN ingest.source_links sl
            ON sl.source_record_id = sr.source_record_id
         WHERE sl.relay_result_id = ra.relay_result_id
           AND ra.leg_order = legs.leg_order
           AND ra.athlete_id IS NULL
           AND legs.target_athlete_id IS NOT NULL
           AND (legs.source_athlete_key IS NULL OR ra.tfrrs_athlete_id = legs.source_athlete_key)`,
        [JSON.stringify(reconcileLegs.map(row => {
          const payload = sourcePayload(row);
          const leg = payload.leg || {};
          return {
            source: row.source,
            parent_source_record_key: payload.relay_parent_source_record_key,
            target_athlete_id: row.target_athlete_id,
            leg_order: leg.leg_order,
            source_athlete_key: leg.tfrrs_athlete_id || leg.athletic_net_athlete_id || null,
          };
        }).filter(row => row.parent_source_record_key && row.target_athlete_id && row.leg_order))]
      );
    }

    if (marks.length) {
      await client.query(
        `UPDATE ingest.observations o
            SET decision = v.decision,
                decision_reason = v.reason,
                confidence = v.confidence,
                canonical_result_id = v.result_id,
                canonical_relay_id = v.relay_result_id
           FROM jsonb_to_recordset($1::jsonb)
             AS v(observation_id bigint, decision text, reason text, confidence numeric,
                 result_id bigint, relay_result_id bigint)
          WHERE o.observation_id = v.observation_id`,
        [JSON.stringify(marks)]
      );
    }
  }

  async insertResult(client, row) {
    const payload = sourcePayload(row);
    const { rows } = await client.query(
      `INSERT INTO public.results
        (athlete_id, team_id, event_name, mark_raw, mark_seconds, mark_meters, mark_feet,
         wind, round, date, season_code, meet_name, meet_location, place, total_competitors,
         is_pr, is_season_best, meet_id, event_id, event_type_id, environment)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, $21)
       ON CONFLICT DO NOTHING
       RETURNING result_id`,
      [
        row.target_athlete_id,
        row.target_team_id,
        row.event_code || row.raw_event_name,
        row.mark_raw,
        row.mark_seconds,
        row.mark_meters,
        payload.mark_feet || null,
        payload.wind || null,
        row.round,
        row.result_date,
        payload.season_code || null,
        row.meet_name,
        payload.meet_location || null,
        row.place,
        payload.total_competitors || null,
        Boolean(payload.is_pr),
        Boolean(payload.is_season_best),
        row.target_meet_id,
        nullableInteger(payload.event_id),
        row.event_type_id,
        payload.environment || null
      ]
    );
    return rows[0]?.result_id || null;
  }

  async insertRelay(client, row) {
    const payload = sourcePayload(row);
    const { rows } = await client.query(
      `INSERT INTO public.relay_results
        (team_id, event_name, mark_raw, mark_seconds, place, meet_name, meet_id,
         event_id, date, round, event_type_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT DO NOTHING
       RETURNING relay_result_id`,
      [
        row.target_team_id,
        row.event_code || row.raw_event_name,
        row.mark_raw,
        row.mark_seconds,
        row.place,
        row.meet_name,
        row.target_meet_id,
        nullableInteger(payload.event_id),
        row.result_date,
        row.round,
        row.event_type_id
      ]
    );
    return rows[0]?.relay_result_id || null;
  }

  async insertRelayAthletes(client, row, relayId) {
    const payload = sourcePayload(row);
    const legs = Array.isArray(payload.relay_athletes) ? payload.relay_athletes : [];
    for (const leg of legs) {
      if (!leg) continue;
      await client.query(
        `INSERT INTO public.relay_athletes
          (relay_result_id, athlete_id, tfrrs_athlete_id, athlete_name, leg_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          relayId,
          leg.athlete_id || leg.target_athlete_id || null,
          leg.tfrrs_athlete_id || null,
          leg.athlete_name || leg.name || null,
          leg.leg_order || null
        ]
      );
    }
  }

  async reconcileRelayLeg(client, row) {
    const payload = sourcePayload(row);
    const parentSourceRecordKey = payload.relay_parent_source_record_key;
    const legOrder = nullableInteger(payload.leg?.leg_order);
    const sourceAthleteKey = payload.leg?.tfrrs_athlete_id || payload.leg?.athletic_net_athlete_id || null;
    if (!parentSourceRecordKey || !legOrder || !row.target_athlete_id) return 0;

    const { rows: parentRows } = await client.query(
      `SELECT sl.relay_result_id
         FROM ingest.source_links sl
         JOIN ingest.source_records sr ON sr.source_record_id = sl.source_record_id
        WHERE sr.source = $1
          AND sr.source_record_key = $2
          AND sl.relay_result_id IS NOT NULL`,
      [row.source, parentSourceRecordKey]
    );
    if (parentRows.length !== 1) return 0;

    const { rowCount } = await client.query(
      `UPDATE public.relay_athletes
          SET athlete_id = $1
        WHERE relay_result_id = $2
          AND leg_order = $3
          AND athlete_id IS NULL
          AND ($4::text IS NULL OR tfrrs_athlete_id = $4)`,
      [row.target_athlete_id, parentRows[0].relay_result_id, legOrder, sourceAthleteKey]
    );
    return rowCount;
  }

  async linkSource(client, row, resultId, relayResultId) {
    await client.query(
      `INSERT INTO ingest.source_links
        (source_record_id, entity_type, result_id, relay_result_id, link_status, first_linked_at, last_seen_at)
       VALUES ($1, $2, $3, $4, 'linked', now(), now())
       ON CONFLICT (source_record_id) DO UPDATE
         SET entity_type = EXCLUDED.entity_type,
             result_id = EXCLUDED.result_id,
             relay_result_id = EXCLUDED.relay_result_id,
             link_status = 'linked',
             last_seen_at = now()`,
      [row.source_record_id, row.entity_type, resultId, relayResultId]
    );
  }

  async markObservation(client, observationId, decision, reason, confidence, resultId, relayId) {
    await client.query(
      `UPDATE ingest.observations
          SET decision = $2,
              decision_reason = $3,
              confidence = $4,
              canonical_result_id = $5,
              canonical_relay_id = $6
        WHERE observation_id = $1`,
      [observationId, decision, reason, confidence, resultId, relayId]
    );
  }

  async quarantine(client, observationId, reason, confidence = 0) {
    await client.query(
      `UPDATE ingest.observations
          SET decision = 'quarantine',
              decision_reason = $2,
              confidence = $3
        WHERE observation_id = $1`,
      [observationId, reason, confidence]
    );
    await client.query(
      `INSERT INTO ingest.quarantine (observation_id, reason_code, status)
       VALUES ($1, $2, 'open')
       ON CONFLICT (observation_id) DO UPDATE
         SET reason_code = EXCLUDED.reason_code,
             status = 'open',
             resolved_at = NULL`,
      [observationId, reason]
    );
  }

  async quarantineExistingRows(client, rows) {
    if (!rows.length) return 0;
    const observationIds = rows.map(row => row.observation_id);
    await client.query(
      `INSERT INTO ingest.quarantine (observation_id, reason_code, status)
       SELECT observation_id,
              COALESCE(validation_errors->0->>'code', decision_reason, 'validation_failed'),
              'open'
         FROM ingest.observations
        WHERE observation_id = ANY($1::bigint[])
       ON CONFLICT (observation_id) DO UPDATE
         SET reason_code = EXCLUDED.reason_code,
             status = 'open',
             resolved_at = NULL`,
      [observationIds]
    );
    return rows.length;
  }

  async close() {
    if (this.ownsPool) await this.pool.end();
  }
}

module.exports = { CanonicalFactWriter, chunk, linkedTarget, nullableInteger, promotionLockKeys };
