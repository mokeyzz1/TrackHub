/**
 * Transactional writer for the canonical public fact tables.
 *
 * Source adapters never write results directly. They normalize source rows, persist those rows in
 * the private ingest schema, and this writer makes the only insert/claim/link decision. The
 * writer deliberately favors a reviewable quarantine over a guessed merge.
 */

const { matchObservation } = require('./result_matcher');
const { Pool } = require('pg');

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

function keyForSourceRecord(row) {
  return `${row.source}|${row.source_record_key}`;
}

function rememberLinkedSource(set, row) {
  // The matcher accepts the bare source_record_key, while the database-level set also needs the
  // source namespace to avoid collisions in a mixed run. Keep both representations deliberately.
  set.add(row.source_record_key);
  set.add(keyForSourceRecord(row));
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
  constructor({ pool, env = process.env, historyWindowDays = 7 } = {}) {
    const connectionString = connectionStringFromEnv(env);
    if (!pool && !connectionString) {
      throw new Error('INGEST_DATABASE_URL is required for the canonical fact writer');
    }
    this.pool = pool || new Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      application_name: 'trackhub-canonical-writer',
      ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    this.ownsPool = !pool;
    this.historyWindowDays = historyWindowDays;
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

      const { rows } = await client.query(
        `SELECT o.*, sr.source_record_id, sr.source_record_key, sr.payload,
                et.code AS event_code,
                m.name AS meet_name,
                m.date AS meet_canonical_date,
                sl.result_id AS linked_result_id,
                sl.relay_result_id AS linked_relay_result_id
           FROM ingest.observations o
           JOIN ingest.source_records sr ON sr.source_record_id = o.source_record_id
           LEFT JOIN public.event_types et ON et.event_type_id = o.event_type_id
           LEFT JOIN public.meets m ON m.meet_id = o.target_meet_id
           LEFT JOIN ingest.source_links sl ON sl.source_record_id = o.source_record_id
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

      for (const row of rows) {
        const observation = asObservation(row);
        const existing = candidates.get(candidateKey(observation)) || [];

        if (row.decision === 'quarantine') {
          const firstError = Array.isArray(row.validation_errors) ? row.validation_errors[0] : null;
          await this.quarantine(client, row.observation_id, firstError?.code || 'validation_failed', 0);
          stats.quarantined++;
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

  async close() {
    if (this.ownsPool) await this.pool.end();
  }
}

module.exports = { CanonicalFactWriter, chunk, linkedTarget, nullableInteger };
