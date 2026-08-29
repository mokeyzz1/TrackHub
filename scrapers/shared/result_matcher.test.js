const test = require('node:test');
const assert = require('node:assert/strict');

const { matchObservation, relayLineupKey, sameRelayLineup } = require('./result_matcher');

const sourceLineup = [
  { athlete_name: 'Emanuel Latawiec', leg_order: 1 },
  { athlete_name: 'Jon Rice', leg_order: 2 },
  { athlete_name: 'Charles Tomczik', leg_order: 3 },
  { athlete_name: 'Colby Fleck', leg_order: 4 },
];

const observation = {
  entity_type: 'relay_result',
  target_meet_id: 12763,
  target_team_id: 1259,
  event_type_id: 35,
  measure: 'time',
  mark_raw: 'SCR',
  mark_seconds: null,
  mark_meters: null,
  place: null,
  result_date: '2026-04-20',
  relay_athletes: sourceLineup,
};

test('relay lineup identity collapses status-code variants from different sources', () => {
  const existing = {
    ...observation,
    mark_raw: 'NT',
    relay_athletes: sourceLineup.map(leg => ({ ...leg })),
    meet_id: 12763,
    team_id: 1259,
    event_type_id: 35,
    date: '2026-04-20',
  };

  assert.equal(relayLineupKey(observation.relay_athletes), relayLineupKey(existing.relay_athletes));
  assert.equal(sameRelayLineup(observation, existing), true);
  const match = matchObservation(observation, [existing]);
  assert.equal(match.action, 'skip_duplicate');
  assert.equal(match.reason, 'same_relay_lineup_status');
});

test('different relay lineups remain separate status observations', () => {
  const existing = {
    ...observation,
    mark_raw: 'NT',
    relay_athletes: sourceLineup.map(leg => ({ ...leg, athlete_name: `${leg.athlete_name} X` })),
    meet_id: 12763,
    team_id: 1259,
    event_type_id: 35,
    date: '2026-04-20',
  };

  const match = matchObservation(observation, [existing]);
  assert.equal(match.action, 'insert');
  assert.equal(match.reason, 'status_code_requires_source_identity');
});

function individualStatus(overrides = {}) {
  return {
    entity_type: 'individual_result',
    target_meet_id: 12763,
    target_athlete_id: 42,
    event_type_id: 7,
    measure: 'time',
    mark_raw: 'SCR',
    mark_seconds: null,
    mark_meters: null,
    points: null,
    place: null,
    round: null,
    result_date: '2026-04-20',
    ...overrides,
  };
}

function existingIndividualStatus(overrides = {}) {
  return {
    result_id: 700,
    meet_id: 12763,
    athlete_id: 42,
    event_type_id: 7,
    mark_raw: 'NT',
    mark_seconds: null,
    mark_meters: null,
    place: null,
    round: null,
    date: '2026-04-20',
    ...overrides,
  };
}

test('quarantines conflicting individual status codes instead of inserting a second row', () => {
  const match = matchObservation(
    individualStatus(),
    [existingIndividualStatus()]
  );

  assert.equal(match.action, 'quarantine');
  assert.equal(match.reason, 'conflicting_status_codes');
  assert.equal(match.matched.result_id, 700);
});

test('skips an exact repeated individual status code', () => {
  const match = matchObservation(
    individualStatus({ mark_raw: 'NT' }),
    [existingIndividualStatus({ mark_raw: 'NT' })]
  );

  assert.equal(match.action, 'skip_duplicate');
  assert.equal(match.reason, 'same_status_code_same_performance');
});

test('prefers one exact current-meet fact over an unlinked legacy history row', () => {
  const row = individualStatus({
    target_meet_id: 11880,
    mark_raw: '8.32',
    mark_seconds: 8.32,
    place: 1,
    round: 'Preliminaries',
  });
  const match = matchObservation(row, [
    {
      result_id: 701,
      meet_id: 11880,
      athlete_id: 42,
      event_type_id: 7,
      mark_raw: '8.32',
      mark_seconds: 8.32,
      place: 1,
      round: 'Preliminaries',
      date: '2026-02-28',
    },
    {
      result_id: 702,
      meet_id: null,
      athlete_id: 42,
      event_type_id: 7,
      mark_raw: '8.32',
      mark_seconds: 8.32,
      place: 1,
      round: null,
      date: '2025-03-13',
    },
  ]);

  assert.equal(match.action, 'skip_duplicate');
  assert.equal(match.reason, 'same_performance_same_place');
  assert.equal(match.matched.result_id, 701);
});

test('collapses identical current-meet round presentations before matching', () => {
  const row = individualStatus({
    target_meet_id: 11880,
    mark_raw: '8.32',
    mark_seconds: 8.32,
    place: 1,
    round: 'Preliminaries',
  });
  const match = matchObservation(row, [
    {
      result_id: 703,
      meet_id: 11880,
      athlete_id: 42,
      event_type_id: 7,
      mark_raw: '8.32',
      mark_seconds: 8.32,
      place: 1,
      round: 'Finals',
      date: '2026-02-28',
    },
    {
      result_id: 704,
      meet_id: 11880,
      athlete_id: 42,
      event_type_id: 7,
      mark_raw: '8.32',
      mark_seconds: 8.32,
      place: 1,
      round: 'Preliminaries',
      date: '2026-02-28',
    },
    {
      result_id: 705,
      meet_id: 11880,
      athlete_id: 42,
      event_type_id: 7,
      mark_raw: '8.32',
      mark_seconds: 8.32,
      place: 1,
      round: 'Heat 1',
      date: '2026-02-28',
    },
  ]);

  assert.equal(match.action, 'skip_duplicate');
  assert.equal(match.reason, 'same_performance_same_place');
  assert.equal(match.matched.result_id, 704);
});
