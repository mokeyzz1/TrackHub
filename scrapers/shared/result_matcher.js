/**
 * Deterministic result matching policy.
 *
 * This module never deletes and never silently merges conflicting observations. It returns a
 * decision for the transactional writer: insert, skip, claim an unlinked history row, or place
 * the observation in quarantine.
 */

const {
  isStatusCode,
  makePerformanceKey,
  makeCanonicalKey,
  stableMarkKey,
  normalizeRound
} = require('./ingestion_contract');

function asComparableRow(observation, existing) {
  const isRelay = observation.entity_type === 'relay_result';
  return {
    entity_type: observation.entity_type,
    target_meet_id: existing.meet_id ?? null,
    target_athlete_id: isRelay ? null : existing.athlete_id ?? null,
    target_team_id: isRelay ? existing.team_id ?? null : null,
    event_type_id: existing.event_type_id ?? null,
    measure: observation.measure,
    mark_raw: existing.mark_raw,
    mark_seconds: existing.mark_seconds ?? null,
    mark_meters: existing.mark_meters ?? null,
    points: existing.points ?? null,
    place: existing.place ?? null,
    result_date: existing.date ?? null
  };
}

function historyKey(row) {
  const actor = row.entity_type === 'relay_result' ? row.target_team_id : row.target_athlete_id;
  const markKey = stableMarkKey(row);
  if (!actor || !row.event_type_id || !markKey) return null;
  return [row.entity_type, actor, row.event_type_id, row.measure, markKey].join('|');
}

function dateDistanceDays(left, right) {
  if (!left || !right) return null;
  const a = new Date(`${String(left).slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${String(right).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
}

function knownRoundsAreDistinct(left, right) {
  const leftRound = normalizeRound(left?.round).canonical;
  const rightRound = normalizeRound(right?.round).canonical;
  return Boolean(leftRound && rightRound && leftRound !== rightRound);
}

function normalizeRelayAthleteName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function relayLineupKey(legs) {
  if (!Array.isArray(legs) || !legs.length) return null;
  const values = legs
    .slice()
    .sort((left, right) => Number(left?.leg_order || 0) - Number(right?.leg_order || 0))
    .map(leg => normalizeRelayAthleteName(leg?.athlete_name || leg?.name) || String(leg?.athlete_id || ''));
  return values.every(Boolean) ? values.join('|') : null;
}

function sameRelayLineup(observation, existing) {
  if (observation.entity_type !== 'relay_result') return false;
  const sourceKey = relayLineupKey(observation.relay_athletes);
  const existingKey = relayLineupKey(existing.relay_athletes);
  return Boolean(sourceKey && existingKey && sourceKey === existingKey);
}

function statusIdentityMatches(observation, existing) {
  if (!['individual_result', 'relay_leg'].includes(observation.entity_type)) return false;
  if (!isStatusCode(observation.mark_raw) || !isStatusCode(existing.mark_raw)) return false;
  if (Number(existing.meet_id) !== Number(observation.target_meet_id)) return false;
  if (dateDistanceDays(observation.result_date, existing.date) !== 0) return false;
  if (knownRoundsAreDistinct(observation, existing)) return false;
  return (observation.place ?? null) === (existing.place ?? null);
}

/**
 * @param {object} observation normalized observation from normalizeObservation().observation
 * @param {Array<object>} existingRows rows already loaded for this meet/identity scope
 * @param {object} options
 * @param {Set<string>} options.seenSourceKeys source records already linked in this run/database
 * @param {number} options.historyWindowDays maximum date distance for claiming an unlinked history row
 */
function matchObservation(observation, existingRows = [], options = {}) {
  const seenSourceKeys = options.seenSourceKeys || new Set();
  const historyWindowDays = options.historyWindowDays ?? 7;

  if (observation.validation_errors?.length) {
    return {
      action: 'quarantine',
      reason: 'validation_failed',
      confidence: 0,
      candidates: []
    };
  }

  if (seenSourceKeys.has(observation.source_record_key)) {
    return {
      action: 'skip_duplicate',
      reason: 'source_record_already_seen',
      confidence: 1,
      candidates: []
    };
  }

  const performanceKey = makePerformanceKey(observation);
  const canonicalKey = makeCanonicalKey(observation);
  const candidates = [];

  for (const existing of existingRows) {
    const comparable = asComparableRow(observation, existing);
    const existingPerformanceKey = makePerformanceKey(comparable);
    const existingCanonicalKey = makeCanonicalKey(comparable);
    if (observation.entity_type === 'relay_result'
        && isStatusCode(observation.mark_raw)
        && isStatusCode(existing.mark_raw)
        && sameRelayLineup(observation, existing)) {
      candidates.push({ existing, comparable, kind: 'same_relay_lineup_status' });
      continue;
    }
    if (statusIdentityMatches(observation, existing)) {
      const sameCode = String(observation.mark_raw).toLowerCase()
        === String(existing.mark_raw).toLowerCase();
      candidates.push({
        existing,
        comparable,
        kind: sameCode ? 'same_status_code' : 'conflicting_status_codes'
      });
      continue;
    }
    if (canonicalKey && existingCanonicalKey === canonicalKey) {
      candidates.push({ existing, comparable, kind: 'exact_performance' });
      continue;
    }
    if (performanceKey && existingPerformanceKey === performanceKey) {
      // A known prelim/heat and a known final are separate races, even when the athlete
      // records the same mark. Keep the round distinction when both sources provide it;
      // if either source omits the round, retain the conservative conflict quarantine.
      if (knownRoundsAreDistinct(observation, existing)) continue;
      candidates.push({ existing, comparable, kind: 'same_performance_place_conflict' });
    }
  }

  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (candidate.kind === 'same_relay_lineup_status') {
      return {
        action: 'skip_duplicate',
        reason: 'same_relay_lineup_status',
        confidence: 0.99,
        matched: candidate.existing,
        candidates: [candidate.existing]
      };
    }
    if (candidate.kind === 'exact_performance') {
      return {
        action: candidate.existing.meet_id == null ? 'claim' : 'skip_duplicate',
        reason: candidate.existing.meet_id == null
          ? 'existing_history_row_claimed'
          : 'same_performance_same_place',
        confidence: 1,
        matched: candidate.existing,
        candidates: [candidate.existing]
      };
    }

    if (candidate.kind === 'same_status_code') {
      return {
        action: 'skip_duplicate',
        reason: 'same_status_code_same_performance',
        confidence: 0.99,
        matched: candidate.existing,
        candidates: [candidate.existing]
      };
    }

    if (candidate.kind === 'conflicting_status_codes') {
      return {
        action: 'quarantine',
        reason: 'conflicting_status_codes',
        confidence: 0.8,
        matched: candidate.existing,
        candidates: [candidate.existing]
      };
    }

    // Same athlete/team, event, and mark but different places is a source disagreement. Never
    // decide which placing is correct inside the dedupe layer.
    return {
      action: 'quarantine',
      reason: 'same_performance_place_conflict',
      confidence: 0.75,
      matched: candidate.existing,
      candidates: [candidate.existing]
    };
  }

  if (candidates.length > 1) {
    return {
      action: 'quarantine',
      reason: 'multiple_matching_performances',
      confidence: 0.5,
      candidates: candidates.map(candidate => candidate.existing)
    };
  }

  // Athlete-history rows have no meet_id. They can be claimed only when there is exactly one
  // same-athlete/event/mark candidate in a tight date window. This prevents a historical mark
  // from being attached to the wrong meet merely because the athlete ran that time elsewhere.
  const targetHistoryKey = historyKey(observation);
  const historyCandidates = existingRows.filter(existing => {
    if (existing.meet_id != null) return false;
    const comparable = asComparableRow(observation, existing);
    return historyKey(comparable) === targetHistoryKey
      && dateDistanceDays(observation.result_date, existing.date) <= historyWindowDays;
  });

  if (historyCandidates.length === 1) {
    return {
      action: 'claim',
      reason: 'unlinked_history_exact_match',
      confidence: 0.98,
      matched: historyCandidates[0],
      candidates: historyCandidates
    };
  }

  if (historyCandidates.length > 1) {
    return {
      action: 'quarantine',
      reason: 'multiple_history_matches',
      confidence: 0.5,
      candidates: historyCandidates
    };
  }

  // Relay status rows (DNS/DQ/etc.) are legitimate facts but have no numeric identity. Their
  // stable source record key prevents same-source replays; cross-source rows must be reviewed.
  if (observation.entity_type === 'relay_result' && isStatusCode(observation.mark_raw)) {
    return {
      action: 'insert',
      reason: 'status_code_requires_source_identity',
      confidence: 0.9,
      candidates: []
    };
  }

  return {
    action: 'insert',
    reason: 'no_existing_match',
    confidence: 1,
    candidates: []
  };
}

module.exports = {
  matchObservation,
  historyKey,
  dateDistanceDays,
  knownRoundsAreDistinct,
  relayLineupKey,
  sameRelayLineup,
  statusIdentityMatches,
};
