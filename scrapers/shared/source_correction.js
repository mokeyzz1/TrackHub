const { normalizeDate, stableMarkKey } = require('./ingestion_contract');

function comparisonMark(row) {
  // The canonical table has no points column. Read the supplied numeric token, never score
  // components or concatenate annotation digits. Keep status codes on the raw-mark path.
  const supplied = row.measure === 'points' && row.mark_seconds == null && row.mark_meters == null
    ? /^\s*(\d+(?:\.\d+)?)(?:\s|$)/.exec(row.mark_raw || '') : null;
  return stableMarkKey({ ...row, points: row.points ?? (supplied ? Number(supplied[1]) : null) });
}

function sourceCorrectionFields(row) {
  const fact = row.linked_fact;
  if (!fact) return ['linked_target_missing'];
  const fields = [];
  if (row.linked_entity_type && row.linked_entity_type !== row.entity_type) fields.push('entity_type');
  const sameId = (left, right) => String(left ?? '') === String(right ?? '');
  if (!sameId(row.target_meet_id, fact.meet_id)) fields.push('meet');
  if (!sameId(row.event_type_id, fact.event_type_id)) fields.push('event');
  if (row.entity_type === 'relay_result') {
    if (!sameId(row.target_team_id, fact.team_id)) fields.push('team');
  } else {
    if (!sameId(row.target_athlete_id, fact.athlete_id)) fields.push('athlete');
    // Missing affiliations stay a separate review state, not an inferred correction.
    if (row.target_team_id != null && fact.team_id != null && !sameId(row.target_team_id, fact.team_id)) fields.push('team');
  }
  if (comparisonMark(row) !== comparisonMark({ ...fact, measure: row.measure })) fields.push('mark');
  if (!sameId(row.place, fact.place)) fields.push('place');
  const incomingDate = normalizeDate(row.result_date);
  const canonicalDate = normalizeDate(fact.date);
  // The writer may fill an absent source date from the canonical meet. An identical source
  // replay still lacks that date; absence is not a contradictory supplied value.
  if (incomingDate && canonicalDate && incomingDate !== canonicalDate) fields.push('date');
  return fields;
}

module.exports = { sourceCorrectionFields };
