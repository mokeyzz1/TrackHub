const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRound,
  normalizeObservation,
  stableMarkKey
} = require('./ingestion_contract');
const { matchObservation, keyForSourceRecord } = require('./result_matcher');

function individual(overrides = {}) {
  return normalizeObservation({
    source: 'tfrrs',
    entity_type: 'individual_result',
    source_meet_key: 'tfrrs-meet-42',
    source_event_key: 'tfrrs-event-7',
    source_athlete_key: 'tfrrs-athlete-7',
    target_meet_id: 42,
    target_athlete_id: 7,
    event_type_id: 1,
    event_type: { measure: 'time' },
    raw_event_name: '200 Meters',
    mark_raw: '45.15',
    place: 1,
    round: 'Finals',
    date: '2026-08-19',
    ...overrides
  }).observation;
}

test('normalizes heat labels without discarding the raw subdivision', () => {
  assert.deepEqual(normalizeRound('Heat 2'), {
    raw: 'Heat 2',
    canonical: 'Preliminaries',
    subdivision: 2
  });
  assert.equal(normalizeRound('Final').canonical, 'Finals');
});

test('keeps a time and metre mark in different identity spaces', () => {
  const time = individual({ mark_raw: '6.88', event_type_id: 2, event_type: { measure: 'time' } });
  const distance = individual({
    mark_raw: '6.88m',
    event_type_id: 3,
    event_type: { measure: 'distance' },
    mark_meters: 6.88
  });

  assert.equal(stableMarkKey(time), 'seconds:6.880');
  assert.equal(stableMarkKey(distance), 'meters:6.880');
  assert.notEqual(time.canonical_key, distance.canonical_key);
});

test('parses aggregate multi-event points only when the catalog says points', () => {
  const aggregate = individual({
    event_type_id: 50,
    event_type: { measure: 'points' },
    mark_raw: '8420'
  });
  assert.equal(aggregate.points, 8420);
  assert.equal(aggregate.mark_seconds, null);
  assert.equal(aggregate.mark_meters, null);
  assert.deepEqual(aggregate.validation_errors, []);

  const component = individual({
    event_type_id: 50,
    event_type: { measure: 'points' },
    mark_raw: '1:00.28'
  });
  assert.ok(component.validation_errors.some(error => error.code === 'multi_event_component_mark'));
});

test('quarantines a named source team without a verified canonical team mapping', () => {
  const row = individual({
    target_team_id: null,
    source_team_name: 'Moorpark',
    require_named_team: true,
  });
  assert.equal(row.decision, 'quarantine');
  assert.ok(row.validation_errors.some(error => error.code === 'missing_team'));

  const unattached = individual({
    target_team_id: null,
    source_team_name: 'Unattached',
    require_named_team: true,
  });
  assert.equal(unattached.decision, 'pending');
});

test('rejects unmapped events before a writer can commit them', () => {
  const row = individual({ event_type_id: null });
  assert.equal(row.decision, 'quarantine');
  assert.ok(row.validation_errors.some(error => error.code === 'missing_event_type'));
});

test('skips the same performance from a second source despite annotation and round differences', () => {
  const row = individual();
  const result = matchObservation(row, [{
    result_id: 900,
    meet_id: 42,
    athlete_id: 7,
    event_type_id: 1,
    mark_raw: '45.15a',
    mark_seconds: 45.15,
    place: 1,
    round: 'Preliminaries',
    date: '2026-08-19'
  }]);

  assert.equal(result.action, 'skip_duplicate');
  assert.equal(result.reason, 'same_performance_same_place');
  assert.equal(result.matched.result_id, 900);
});

test('quarantines same mark with conflicting place instead of choosing a source', () => {
  const row = individual();
  const result = matchObservation(row, [{
    result_id: 901,
    meet_id: 42,
    athlete_id: 7,
    event_type_id: 1,
    mark_raw: '45.15',
    mark_seconds: 45.15,
    place: 2,
    round: 'Finals',
    date: '2026-08-19'
  }]);

  assert.equal(result.action, 'quarantine');
  assert.equal(result.reason, 'same_performance_place_conflict');
});

test('keeps known preliminaries and finals as separate performances', () => {
  const row = individual({ place: 5, round: 'Preliminaries' });
  const result = matchObservation(row, [{
    result_id: 904,
    meet_id: 42,
    athlete_id: 7,
    event_type_id: 1,
    mark_raw: '45.15',
    mark_seconds: 45.15,
    place: 4,
    round: 'Finals',
    date: '2026-08-19'
  }]);

  assert.equal(result.action, 'insert');
  assert.equal(result.reason, 'no_existing_match');
});

test('does not guess a round when one source omits it', () => {
  const row = individual({ place: 5, round: 'Preliminaries' });
  const result = matchObservation(row, [{
    result_id: 905,
    meet_id: 42,
    athlete_id: 7,
    event_type_id: 1,
    mark_raw: '45.15',
    mark_seconds: 45.15,
    place: 4,
    round: null,
    date: '2026-08-19'
  }]);

  assert.equal(result.action, 'quarantine');
  assert.equal(result.reason, 'same_performance_place_conflict');
});

test('claims one matching unlinked history row only inside the date window', () => {
  const row = individual({ date: '2026-08-19' });
  const result = matchObservation(row, [{
    result_id: 902,
    meet_id: null,
    athlete_id: 7,
    event_type_id: 1,
    mark_raw: '45.15',
    mark_seconds: 45.15,
    place: 1,
    date: '2026-08-18'
  }]);

  assert.equal(result.action, 'claim');
  assert.equal(result.reason, 'unlinked_history_exact_match');
});

test('does not claim a same mark from a distant historical date', () => {
  const row = individual({ date: '2026-08-19' });
  const result = matchObservation(row, [{
    result_id: 903,
    meet_id: null,
    athlete_id: 7,
    event_type_id: 1,
    mark_raw: '45.15',
    mark_seconds: 45.15,
    place: 1,
    date: '2026-06-01'
  }]);

  assert.equal(result.action, 'insert');
  assert.equal(result.reason, 'no_existing_match');
});

test('treats relay status codes as facts without pretending they have numeric identity', () => {
  const row = normalizeObservation({
    source: 'athletic_net',
    entity_type: 'relay_result',
    source_meet_key: 'anet-meet-42',
    source_event_key: '4x100m',
    source_team_key: 'anet-team-7',
    target_meet_id: 42,
    target_team_id: 7,
    event_type_id: 31,
    event_type: { measure: 'time' },
    mark_raw: 'DNS',
    place: null,
    date: '2026-08-19'
  }).observation;

  assert.equal(row.canonical_key, null);
  assert.equal(matchObservation(row, []).action, 'insert');
});

test('skips a source record already linked earlier in the same run', () => {
  const row = individual({ source_record_key: 'source-row-7' });
  const result = matchObservation(row, [], {
    seenSourceKeys: new Set([keyForSourceRecord(row)])
  });

  assert.equal(result.action, 'skip_duplicate');
  assert.equal(result.reason, 'source_record_already_seen');
});

test('provider-local record IDs cannot suppress another provider observation', () => {
  const row = individual({ source_record_key: 'source-row-7' });
  const result = matchObservation(row, [], {
    seenSourceKeys: new Set([keyForSourceRecord({ ...row, source: 'athletic_net' })])
  });
  assert.equal(result.action, 'insert');
});

test('source identity tuples cannot collide through delimiters', () => {
  assert.notEqual(
    keyForSourceRecord({ source: 'a|b', source_record_key: 'c' }),
    keyForSourceRecord({ source: 'a', source_record_key: 'b|c' })
  );
});
