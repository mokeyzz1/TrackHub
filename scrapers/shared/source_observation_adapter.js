/**
 * Converts either scraper's source-specific row shape into the shared ingestion contract.
 * This is the seam where TFRRS and athletic.net are allowed to differ in HTML terminology.
 */

const { normalizeObservation } = require('./ingestion_contract');

function sourceAthleteKey(source, row) {
  if (row.source_athlete_key) return row.source_athlete_key;
  if (source === 'tfrrs') return row.tfrrs_athlete_id || row.athlete_id || row.athlete_name;
  if (source === 'athletic_net') return row.athletic_net_athlete_id || row.athlete_id || row.athlete_name;
  return row.source_athlete_key || row.athlete_id || row.athlete_name;
}

function sourceTeamKey(source, row) {
  if (row.source_team_key) return row.source_team_key;
  if (source === 'tfrrs') return row.tfrrs_team_id || row.team_id || row.school_name;
  if (source === 'athletic_net') return row.athletic_net_team_id || row.team_id || row.team_name;
  return row.source_team_key || row.team_id || row.school_name || row.team_name;
}

function sourceEventKey(row) {
  return row.source_event_key || row.event_id || row.event_code || row.event_name;
}

function normalizeAthleteIdentityName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// TFRRS result tables can omit athlete IDs for junior-college rows. A name by itself is not a
// stable identity, so aliases for those rows use the meet + canonical team + gender scope.
function scopedSourceAthleteKey(source, row, teamResolution = null) {
  if (source !== 'tfrrs' || row.tfrrs_athlete_id || row.athlete_id) return null;
  const sourceMeet = row.source_meet_key || row.sourceMeetKey || row.meet_id;
  const teamId = teamResolution?.team_id || row.team_id || null;
  const gender = row.team_gender || row.gender;
  const name = normalizeAthleteIdentityName(row.athlete_name || row.name);
  if (!sourceMeet || !teamId || !gender || !name) return null;
  return `tfrrs:meet=${String(sourceMeet).trim()}|team=${String(teamId).trim()}|gender=${String(gender).trim()}|name=${name}`;
}

function resolveTeam(source, row, teamResolver) {
  if (row.team_id) return { team_id: row.team_id, match_field: 'row_team_id', match_method: 'source_resolved' };
  if (!teamResolver || typeof teamResolver.resolve !== 'function') return null;

  return teamResolver.resolve({
    source,
    sourceTeamKey: sourceTeamKey(source, row),
    sourceTeamName: row.school_name || row.team_name,
    sourceGender: row.team_gender || row.gender
  });
}

function resolveAthlete(source, row, athleteResolver, teamResolution = null) {
  if (row.athlete_id) {
    return { athlete_id: row.athlete_id, match_field: 'row_athlete_id', match_method: 'source_resolved' };
  }
  if (!athleteResolver || typeof athleteResolver.resolve !== 'function') return null;

  return athleteResolver.resolve({
    source,
    sourceAthleteKey: sourceAthleteKey(source, row),
    sourceAthleteScopeKey: scopedSourceAthleteKey(source, row, teamResolution),
    sourceAthleteName: row.athlete_name || row.name,
    sourceGender: row.team_gender || row.gender,
    sourceTeamName: row.school_name || row.team_name,
    sourceTeamId: teamResolution?.team_id || row.team_id || null,
    sourceMeetId: row.target_meet_id || row.meet_id || null
  });
}

function commonInput(source, row, events, entityType, overrides = {}, options = {}) {
  const eventTypeId = row.event_type_id || events.resolve(row.event_name || row.event_code);
  const eventType = eventTypeId ? events.detailsById(eventTypeId) : null;
  const teamResolution = resolveTeam(source, row, options.teamResolver);
  const athleteResolution = resolveAthlete(source, row, options.athleteResolver, teamResolution);
  const derivedPayload = { ...row };
  if (teamResolution && teamResolution.match_field !== 'row_team_id') {
    derivedPayload.ingestion_team_resolution = teamResolution;
  }
  if (athleteResolution && athleteResolution.match_field !== 'row_athlete_id') {
    derivedPayload.ingestion_athlete_resolution = athleteResolution;
  }
  return {
    source,
    entity_type: entityType,
    source_meet_key: row.source_meet_key || row.sourceMeetKey || row.meet_id,
    source_event_key: sourceEventKey(row),
    source_athlete_key: sourceAthleteKey(source, row),
    source_team_key: sourceTeamKey(source, row),
    source_team_name: row.school_name || row.team_name || null,
    require_named_team: Boolean(options.requireNamedTeam),
    source_url: row.source_url || row.meet_url || row.event_url || null,
    target_meet_id: row.meet_id,
    target_athlete_id: athleteResolution?.athlete_id || null,
    target_team_id: teamResolution?.team_id || null,
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
    payload: (teamResolution && teamResolution.match_field !== 'row_team_id') ||
      (athleteResolution && athleteResolution.match_field !== 'row_athlete_id')
      ? derivedPayload
      : row,
    ...overrides
  };
}

function normalizeSourceRow(source, row, events, entityType = row.is_relay ? 'relay_result' : 'individual_result', options = {}) {
  const normalized = normalizeObservation(commonInput(source, row, events, entityType, {}, options));
  const records = [normalized];

  if (entityType === 'relay_result') {
    const parentKey = normalized.sourceRecord.source_record_key;
    for (const [index, leg] of (row.relay_athletes || []).entries()) {
      const legInput = commonInput(source, {
        ...row,
        athlete_id: leg.athlete_id,
        athlete_name: leg.athlete_name || leg.name,
        source_athlete_key: leg.source_athlete_key || leg.tfrrs_athlete_id || leg.athletic_net_athlete_id || leg.athlete_id || leg.athlete_name,
        source_event_key: sourceEventKey(row),
        payload: { ...row, leg }
      }, events, 'relay_leg', {
        source_record_key: `${parentKey}:leg:${leg.leg_order || index + 1}`,
        payload: { ...row, leg, relay_parent_source_record_key: parentKey }
      }, options);
      records.push(normalizeObservation(legInput));
    }
  }

  return records;
}

function normalizeSourceRows(source, rows, events, options = {}) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    for (const record of normalizeSourceRow(source, row, events, undefined, options)) {
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
  scopedSourceAthleteKey,
  sourceTeamKey,
  sourceEventKey
};
