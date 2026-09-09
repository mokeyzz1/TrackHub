const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSourceRow, normalizeSourceRows } = require('./source_observation_adapter');

function events() {
  const catalog = new Map([
    [1, { event_type_id: 1, code: '200m', measure: 'time' }],
    [2, { event_type_id: 2, code: 'Long Jump', measure: 'distance' }]
  ]);
  return {
    resolve: name => /long/i.test(name) ? 2 : 1,
    detailsById: id => catalog.get(id) || null
  };
}

test('normalizes TFRRS and athletic.net rows through the same field contract', () => {
  const [tfrrs] = normalizeSourceRow('tfrrs', {
    meet_id: 42,
    source_meet_key: 'tfrrs-42',
    event_id: 7,
    event_name: '200 Meters',
    tfrrs_athlete_id: 't-7',
    athlete_id: 7,
    team_id: 8,
    mark_raw: '22.15a',
    mark_seconds: 22.15,
    place: 1,
    round: 'Finals',
    date: '2026-08-19'
  }, events());
  const [anet] = normalizeSourceRow('athletic_net', {
    meet_id: 42,
    source_meet_key: 'anet-42',
    event_code: '200 Meters',
    event_name: '200 Meters',
    athletic_net_athlete_id: 'a-7',
    athlete_id: 7,
    team_id: 8,
    mark_raw: '22.15',
    mark_seconds: 22.15,
    place: 1,
    date: '2026-08-19'
  }, events());

  assert.equal(tfrrs.observation.target_athlete_id, 7);
  assert.equal(anet.observation.target_athlete_id, 7);
  assert.equal(tfrrs.observation.measure, 'time');
  assert.equal(anet.observation.event_type_id, 1);
  assert.equal(tfrrs.observation.performance_key, anet.observation.performance_key);
  assert.notEqual(tfrrs.sourceRecord.source_record_key, anet.sourceRecord.source_record_key);
});

test('preserves a source athlete key when a target athlete was hydrated separately', () => {
  const [record] = normalizeSourceRow('tfrrs', {
    meet_id: 42,
    source_meet_key: 'tfrrs-42',
    event_id: 7,
    event_name: '200 Meters',
    athlete_id: 183844,
    source_athlete_key: 'Ryan Mann',
    mark_raw: '22.15',
    mark_seconds: 22.15,
    place: 1,
    date: '2026-08-19'
  }, events());

  assert.equal(record.observation.target_athlete_id, 183844);
  assert.equal(record.observation.source_athlete_key, 'Ryan Mann');
});

test('emits a parent relay observation and separately attributable leg observations', () => {
  const rows = normalizeSourceRow('tfrrs', {
    meet_id: 42,
    source_meet_key: 'tfrrs-42',
    event_id: 99,
    event_name: '4x100 Relay',
    team_id: 8,
    source_team_key: 'ca_college_m_orange_coast',
    school_name: 'Orange Coast',
    mark_raw: '39.30',
    mark_seconds: 39.3,
    place: 1,
    round: 'Finals',
    date: '2026-08-19',
    is_relay: true,
    relay_athletes: [
      { athlete_id: 7, athlete_name: 'A One', leg_order: 1 },
      { athlete_id: 9, athlete_name: 'B Two', leg_order: 2 }
    ]
  }, events());

  assert.equal(rows.length, 3);
  assert.equal(rows[0].observation.entity_type, 'relay_result');
  assert.equal(rows[0].observation.target_team_id, 8);
  assert.equal(rows[0].observation.source_team_key, 'ca_college_m_orange_coast');
  assert.equal(rows[0].sourceRecord.payload.school_name, 'Orange Coast');
  assert.equal(rows[1].observation.entity_type, 'relay_leg');
  assert.equal(rows[2].observation.entity_type, 'relay_leg');
  assert.notEqual(rows[1].sourceRecord.source_record_key, rows[2].sourceRecord.source_record_key);
  assert.equal(rows[1].sourceRecord.payload.relay_parent_source_record_key,
    rows[0].sourceRecord.source_record_key);
});

test('collapses an exact repeated source row before batch persistence', () => {
  const row = {
    meet_id: 42,
    source_meet_key: 'tfrrs-42',
    event_id: 7,
    event_name: '200 Meters',
    tfrrs_athlete_id: 't-7',
    athlete_id: 7,
    mark_raw: '22.15',
    mark_seconds: 22.15,
    place: 1,
    date: '2026-08-19'
  };
  assert.equal(normalizeSourceRows('tfrrs', [row, row], events()).length, 1);
});
