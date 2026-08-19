/**
 * Converts either scraper's source-specific row shape into the shared ingestion contract.
 * This is the seam where TFRRS and athletic.net are allowed to differ in HTML terminology.
 */

const { normalizeObservation } = require('./ingestion_contract');

function sourceAthleteKey(source, row) {
  if (source === 'tfrrs') return row.tfrrs_athlete_id || row.athlete_id || row.athlete_name;
  if (source === 'athletic_net') return row.athletic_net_athlete_id || row.athlete_id || row.athlete_name;
  return row.source_athlete_key || row.athlete_id || row.athlete_name;
}

function sourceTeamKey(source, row) {
  if (source === 'tfrrs') return row.tfrrs_team_id || row.team_id || row.school_name;
  if (source === 'athletic_net') return row.athletic_net_team_id || row.team_id || row.team_name;
  return row.source_team_key || row.team_id || row.school_name || row.team_name;
}

function sourceEventKey(row) {
  return row.source_event_key || row.event_id || row.event_code || row.event_name;
}

function commonInput(source, row, events, entityType, overrides = {}) {
  const eventTypeId = row.event_type_id || events.resolve(row.event_name || row.event_code);
  const eventType = eventTypeId ? events.detailsById(eventTypeId) : null;
  return {
    source,
    entity_type: entityType,
    source_meet_key: row.source_meet_key || row.sourceMeetKey || row.meet_id,
    source_event_key: sourceEventKey(row),
    source_athlete_key: sourceAthleteKey(source, row),
    source_team_key: sourceTeamKey(source, row),
    source_url: row.source_url || row.meet_url || row.event_url || null,
    target_meet_id: row.meet_id,
    target_athlete_id: row.athlete_id,
    target_team_id: row.team_id,
    event_type_id: eventTypeId,
    event_type: eventType,
    raw_event_name: row.event_name || row.event_code,
    mark_raw: row.mark_raw,
    mark_seconds: row.mark_seconds,
    mark_meters: row.mark_meters,
    points: row.points,
    place: row.place,
    round: row.round,
    date: row.date,
    payload: row,
    ...overrides
  };
}

function normalizeSourceRow(source, row, events, entityType = row.is_relay ? 'relay_result' : 'individual_result') {
  const normalized = normalizeObservation(commonInput(source, row, events, entityType));
  const records = [normalized];

  if (entityType === 'relay_result') {
    const parentKey = normalized.sourceRecord.source_record_key;
    for (const [index, leg] of (row.relay_athletes || []).entries()) {
      const legInput = commonInput(source, {
        ...row,
        athlete_id: leg.athlete_id,
        athlete_name: leg.athlete_name || leg.name,
        source_athlete_key: leg.tfrrs_athlete_id || leg.athletic_net_athlete_id || leg.athlete_id || leg.athlete_name,
        source_event_key: sourceEventKey(row),
        payload: { ...row, leg }
      }, events, 'relay_leg', {
        source_record_key: `${parentKey}:leg:${leg.leg_order || index + 1}`,
        payload: { ...row, leg, relay_parent_source_record_key: parentKey }
      });
      records.push(normalizeObservation(legInput));
    }
  }

  return records;
}

function normalizeSourceRows(source, rows, events) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    for (const record of normalizeSourceRow(source, row, events)) {
      const key = `${record.sourceRecord.source}|${record.sourceRecord.source_record_key}`;
      // HTML pages occasionally repeat the same row in two presentation tables. The source
      // identity is stable, so collapse the exact replay before it reaches the batch writer.
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(record);
    }
  }
  return out;
}

module.exports = {
  normalizeSourceRow,
  normalizeSourceRows,
  sourceAthleteKey,
  sourceTeamKey,
  sourceEventKey
};
