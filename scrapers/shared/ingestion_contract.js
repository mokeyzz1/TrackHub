/**
 * Canonical ingestion contract.
 *
 * Scrapers are allowed to disagree about HTML and field names. They are not allowed to disagree
 * about what they hand to the writer. This module is deliberately pure: it performs no database
 * calls and never guesses an identity that is not present in the input.
 */

const crypto = require('crypto');
const { parseMark } = require('./mark_parser');
const { normaliseMarkKey } = require('./result_fingerprint');

const SOURCES = Object.freeze(['tfrrs', 'athletic_net', 'ustfccca', 'manual']);
const ENTITY_TYPES = Object.freeze(['individual_result', 'relay_result', 'relay_leg']);
const MEASURES = Object.freeze(['time', 'distance', 'points', 'unknown']);

// These are real result values, not missing rows. They have no numeric identity and therefore
// must never be used as a relay performance key by themselves.
const STATUS_CODES = new Set([
  'dns', 'dnf', 'dq', 'fs', 'scr', 'nt', 'nm', 'nh', 'nd', 'enr', 'np', 'nwi'
]);

function text(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).normalize('NFKC').trim();
  return normalized || null;
}

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/**
 * Canonical round for matching. Heat N is a subdivision of preliminaries, not a separate race.
 * The raw label remains available on the source payload for provenance.
 */
function normalizeRound(value) {
  const raw = text(value);
  if (!raw) return { raw: null, canonical: null, subdivision: null };

  const compact = raw.toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const heat = compact.match(/^(?:heat|h)\s*#?\s*(\d+)$/);
  if (heat) {
    return { raw, canonical: 'Preliminaries', subdivision: Number(heat[1]) };
  }
  if (/prelim|qualif|heat/.test(compact)) {
    return { raw, canonical: 'Preliminaries', subdivision: null };
  }
  if (/semi/.test(compact)) {
    return { raw, canonical: 'Semifinals', subdivision: null };
  }
  if (/final/.test(compact)) {
    return { raw, canonical: 'Finals', subdivision: null };
  }

  return { raw, canonical: raw, subdivision: null };
}

function normalizeMeasure(eventType, explicitMeasure) {
  const raw = text(explicitMeasure || eventType?.measure);
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower === 'time' || lower === 'distance' || lower === 'points') return lower;
  return 'unknown';
}

function isStatusCode(mark) {
  const key = text(mark)?.toLowerCase();
  return Boolean(key && STATUS_CODES.has(key));
}

function stableMarkKey(row = {}) {
  const measure = row.measure;
  const markRaw = row.mark_raw ?? row.markRaw;
  const markSeconds = row.mark_seconds ?? row.markSeconds ?? null;
  const markMeters = row.mark_meters ?? row.markMeters ?? null;
  const points = row.points ?? row.mark_points ?? row.markPoints ?? null;
  if (measure === 'points' && points !== null) return `points:${Number(points).toFixed(3)}`;
  if (measure === 'time' && markSeconds !== null) return `seconds:${Number(markSeconds).toFixed(3)}`;
  if (measure === 'distance' && markMeters !== null) return `meters:${Number(markMeters).toFixed(3)}`;

  // Keep the unit marker. `6.88` and `6.88m` can be a time and a field mark in a multi-event
  // page, and stripping every trailing letter collapses those two legitimate performances.
  const rawKey = normaliseMarkKey(markRaw);
  return rawKey ? `raw:${rawKey}` : null;
}

function identityActor(entityType, row) {
  if (entityType === 'relay_result') return row.target_team_id;
  return row.target_athlete_id;
}

function makePerformanceKey(row) {
  const actor = identityActor(row.entity_type, row);
  const markKey = stableMarkKey(row);
  if (!row.target_meet_id || !row.event_type_id || !actor || !markKey) return null;

  // Round is deliberately excluded. A timed final can be labelled both Finals and Heat N by
  // different sources; an identical mark/place is one performance, not two races.
  return [row.entity_type, row.target_meet_id, actor, row.event_type_id, row.measure, markKey].join('|');
}

function makeCanonicalKey(row) {
  const performanceKey = makePerformanceKey(row);
  if (!performanceKey) return null;
  return `${performanceKey}|place:${row.place ?? ''}`;
}

function derivedSourceRecordKey(input) {
  const fields = [
    text(input.source),
    text(input.entity_type),
    text(input.source_meet_key),
    text(input.source_event_key),
    text(input.source_athlete_key || input.source_team_key),
    normaliseMarkKey(input.mark_raw),
    positiveInteger(input.place) ?? '',
    // Source identity keeps the raw subdivision (Heat 1 vs Heat 2) even though canonical
    // performance matching intentionally collapses heats into Preliminaries.
    normalizeRound(input.round).raw || '',
    positiveInteger(input.ordinal) ?? ''
  ];

  const digest = crypto.createHash('sha256').update(fields.join('\u001f')).digest('hex');
  return `derived:${digest}`;
}

function validationError(code, field, message) {
  return { code, field, message };
}

/**
 * Normalize one source row. The result is safe to serialize into ingest.source_records and
 * ingest.observations. It is not yet permission to write a canonical result.
 */
function normalizeObservation(input = {}) {
  const source = text(input.source);
  const entityType = text(input.entity_type || input.entityType);
  const eventType = input.event_type || input.eventType || {};
  const round = normalizeRound(input.round);
  const measure = normalizeMeasure(eventType, input.measure);
  const markRaw = text(input.mark_raw ?? input.markRaw);

  const parsed = parseMark(markRaw);
  const markSeconds = number(input.mark_seconds ?? input.markSeconds ?? parsed.mark_seconds);
  const markMeters = number(input.mark_meters ?? input.markMeters ?? parsed.mark_meters);
  const explicitPoints = number(input.points ?? input.mark_points ?? input.markPoints);
  // Bare integers are points only after the canonical event catalog says this is a points event.
  // The same string must remain unparsed for time/distance events.
  const points = explicitPoints !== null
    ? explicitPoints
    : measure === 'points' && /^\d+(?:\.\d+)?$/.test(markRaw || '')
      ? Number(markRaw)
      : null;

  const row = {
    source,
    entity_type: entityType,
    target_meet_id: positiveInteger(input.target_meet_id ?? input.meet_id ?? input.meetId),
    target_athlete_id: positiveInteger(input.target_athlete_id ?? input.athlete_id ?? input.athleteId),
    target_team_id: positiveInteger(input.target_team_id ?? input.team_id ?? input.teamId),
    event_type_id: positiveInteger(input.event_type_id ?? input.eventTypeId),
    raw_event_name: text(input.raw_event_name ?? input.event_name ?? input.eventName),
    measure,
    mark_raw: markRaw,
    mark_seconds: markSeconds,
    mark_meters: markMeters,
    points,
    place: positiveInteger(input.place),
    round: round.canonical,
    round_raw: round.raw,
    round_subdivision: round.subdivision,
    result_date: normalizeDate(input.result_date ?? input.date),
  };

  const errors = [];
  if (!SOURCES.includes(source)) errors.push(validationError('invalid_source', 'source', `Unsupported source: ${source}`));
  if (!ENTITY_TYPES.includes(entityType)) errors.push(validationError('invalid_entity_type', 'entity_type', `Unsupported entity type: ${entityType}`));
  if (!row.target_meet_id) errors.push(validationError('missing_target_meet', 'target_meet_id', 'A canonical meet is required before commit.'));
  if (!row.event_type_id) errors.push(validationError('missing_event_type', 'event_type_id', 'An unmapped event cannot be committed.'));
  if (measure === 'unknown') errors.push(validationError('unknown_measure', 'measure', 'The canonical event has no verified measurement type.'));
  if (entityType === 'individual_result' || entityType === 'relay_leg') {
    if (!row.target_athlete_id) errors.push(validationError('missing_athlete', 'target_athlete_id', 'An individual result needs an internal athlete identity.'));
  }
  if (entityType === 'relay_result' && !row.target_team_id) {
    errors.push(validationError('missing_team', 'target_team_id', 'A relay without a resolved team cannot be deduplicated automatically.'));
  }
  if (!markRaw) errors.push(validationError('missing_mark', 'mark_raw', 'The source row has no mark or status code.'));

  const numericFields = [markSeconds !== null, markMeters !== null, points !== null].filter(Boolean).length;
  if (numericFields > 1) {
    errors.push(validationError('multiple_measurements', 'mark_raw', 'A result cannot carry time, distance, and points simultaneously.'));
  }
  if (measure === 'points' && (markSeconds !== null || markMeters !== null)) {
    errors.push(validationError('multi_event_component_mark', 'measure', 'Component time/distance was supplied where aggregate points are required.'));
  }
  if (measure === 'time' && markMeters !== null) {
    errors.push(validationError('time_distance_conflict', 'mark_meters', 'A time event cannot be stored as a distance.'));
  }
  if (measure === 'distance' && markSeconds !== null) {
    errors.push(validationError('distance_time_conflict', 'mark_seconds', 'A distance event cannot be stored as a time.'));
  }

  const sourceMeetKey = text(input.source_meet_key ?? input.sourceMeetKey);
  const sourceEventKey = text(input.source_event_key ?? input.sourceEventKey);
  const sourceAthleteKey = text(input.source_athlete_key ?? input.sourceAthleteKey);
  const sourceTeamKey = text(input.source_team_key ?? input.sourceTeamKey);
  const sourceRecordKey = text(input.source_record_key ?? input.sourceRecordKey)
    || derivedSourceRecordKey({
      source,
      entity_type: entityType,
      source_meet_key: sourceMeetKey,
      source_event_key: sourceEventKey,
      source_athlete_key: sourceAthleteKey,
      source_team_key: sourceTeamKey,
      mark_raw: markRaw,
      place: row.place,
      round: round.raw,
      ordinal: input.ordinal
    });

  const performanceKey = makePerformanceKey(row);
  const canonicalKey = entityType === 'relay_result' && isStatusCode(markRaw)
    ? null
    : makeCanonicalKey(row);

  return {
    sourceRecord: {
      source,
      source_record_key: sourceRecordKey,
      source_meet_key: sourceMeetKey,
      source_event_key: sourceEventKey,
      source_url: text(input.source_url ?? input.sourceUrl),
      payload_hash: text(input.payload_hash ?? input.payloadHash),
      payload: input.payload && typeof input.payload === 'object' ? input.payload : {}
    },
    observation: {
      ...row,
      source,
      entity_type: entityType,
      source_record_key: sourceRecordKey,
      source_meet_key: sourceMeetKey,
      source_event_key: sourceEventKey,
      source_athlete_key: sourceAthleteKey,
      source_team_key: sourceTeamKey,
      performance_key: performanceKey,
      canonical_key: canonicalKey,
      validation_errors: errors,
      decision: errors.length ? 'quarantine' : 'pending'
    },
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  SOURCES,
  ENTITY_TYPES,
  MEASURES,
  STATUS_CODES,
  normalizeDate,
  normalizeRound,
  normalizeMeasure,
  isStatusCode,
  stableMarkKey,
  makePerformanceKey,
  makeCanonicalKey,
  derivedSourceRecordKey,
  normalizeObservation
};
