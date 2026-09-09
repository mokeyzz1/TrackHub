const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertSourceDate,
  decodeFirestoreDocument,
  extractMeetIdAndFirebase,
  isFourBy100,
  parseKarmarushRows,
  parseMileSplitRows,
  selectMileSplitTimerMeet,
  relayLegsFromKarmarush,
} = require('./timing_adapters');

test('event filter accepts ordinary 4x100 spellings but rejects shuttle relays', () => {
  for (const value of ['4x100', '4x100m', '4x100 Meter Relay', '4 x 100 Relay', 'Women 4x100m']) {
    assert.equal(isFourBy100(value), true, value);
  }
  for (const value of ['4x100 Shuttle Hurdles', '4x200', '4x400m', '100m']) {
    assert.equal(isFourBy100(value), false, value);
  }
});

test('Karmarush parser extracts only the four race legs and keeps event rounds', () => {
  const rows = parseKarmarushRows({
    source: 'pt_timing',
    sourceMeetId: '8642',
    sourceUrl: 'https://live.pttiming.com/?mid=8642',
    targetMeetId: 13048,
    meta: { ID: 8642, name: 'Test Invitational', startDate: '2026-04-10T00:00:00' },
    meetEvents: {
      '5-2': {
        E: { C: 'RELAY', ID: '4x100', N: '4x100' },
        G: 'F',
        RN: 'Final',
        ED: {
          '2302819': {
            TID: 1043,
            TN: 'Ashland',
            M: '44.97',
            P: 3,
            RRD: [null,
              { L: 1, A: { ID: 11, N: 'One Runner' } },
              { L: 2, A: { ID: 12, N: 'Two Runner' } },
              { L: 3, A: { ID: 13, N: 'Three Runner' } },
              { L: 4, A: { ID: 14, N: 'Four Runner' } },
              { L: 5, A: { ID: 15, N: 'Alternate' } },
            ]
          }
        }
      },
      '6-2': { E: { ID: '4x400', N: '4x400' }, ED: {} }
    }
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_name, '4x100m');
  assert.equal(rows[0].team_gender, 'F');
  assert.equal(rows[0].round, 'Finals');
  assert.equal(rows[0].source_team_key, '1043');
  assert.equal(rows[0].relay_athletes.length, 4);
  assert.deepEqual(rows[0].relay_athletes.map(leg => leg.leg_order), [1, 2, 3, 4]);
});

test('Karmarush parser retains published status rows without inventing numeric marks', () => {
  const rows = parseKarmarushRows({
    source: 'leonetiming',
    sourceMeetId: '8920',
    sourceUrl: 'https://results.leonetiming.com/?mid=8920',
    targetMeetId: 13048,
    meta: { name: 'Championships', startDate: '2026-05-21' },
    meetEvents: {
      '5-1': {
        E: { ID: '4x100', N: '4x100' },
        G: 'M',
        RN: 'Final',
        ED: { '1': { TID: 2, TN: 'Example', DQ: true, RRD: [] } }
      }
    }
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mark_raw, 'DQ');
  assert.equal(rows[0].relay_athletes.length, 0);
});

test('MileSplit parser decodes relay documents and maps finals from event rounds', () => {
  const rows = parseMileSplitRows({
    meetId: '732193',
    sourceUrl: 'https://milesplit.live/meets/732193',
    targetMeetId: 13048,
    meet: { name: 'MileSplit Invite', dateStart: '2026-04-10' },
    events: [{
      id: '24',
      code: '4x100m',
      name: '4x100 Meter Relay',
      gender: { fields: { sex: 'F' } },
      rounds: { F: { name: 'Finals' } }
    }],
    entries: [{
      id: '24_F_5552',
      event: 24,
      round: 'F',
      relay: {
        id: 5552,
        team: { name: 'Nashville Christian School', abbreviation: '360' },
        legs: {
          '1': { firstName: 'Maggie', lastName: 'Boatman', legNumber: 1 },
          '2': { firstName: 'Second', lastName: 'Runner', legNumber: 2 },
          '3': { firstName: 'Third', lastName: 'Runner', legNumber: 3 },
          '4': { firstName: 'Fourth', lastName: 'Runner', legNumber: 4 },
          '5': { firstName: 'Alternate', lastName: 'Runner', legNumber: 5 }
        }
      },
      result: { place: 6, text: '51.13', units: 51.124 }
    }]
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].mark_raw, '51.13');
  assert.equal(rows[0].place, 6);
  assert.equal(rows[0].team_gender, 'F');
  assert.equal(rows[0].round, 'Finals');
  assert.equal(rows[0].relay_athletes.length, 4);
  assert.equal(rows[0].relay_athletes[0].athlete_name, 'Maggie Boatman');
});

test('Firestore document decoding preserves the document ID over a conflicting payload field', () => {
  const doc = decodeFirestoreDocument({
    name: 'projects/p/databases/d/documents/meets/732193/events/24',
    fields: {
      id: { stringValue: 'payload-id' },
      code: { stringValue: '4x100m' },
      active: { booleanValue: true },
      rounds: { mapValue: { fields: { F: { mapValue: { fields: { name: { stringValue: 'Finals' } } } } } } }
    }
  });
  assert.equal(doc.id, '24');
  assert.equal(doc.code, '4x100m');
  assert.equal(doc.active, true);
  assert.equal(doc.rounds.F.name, 'Finals');
});

test('Karmarush page metadata can provide a Firebase root and meet ID', () => {
  assert.deepEqual(extractMeetIdAndFirebase(
    'var fbURL = "https://example.firebaseio.com/"; var meetID = 8920;'
  , 'leonetiming'), {
    meetId: '8920',
    firebaseBase: 'https://example.firebaseio.com/'
  });
});

test('Karmarush legs use source IDs when present and a scoped fallback when absent', () => {
  const legs = relayLegsFromKarmarush([
    null,
    { L: 1, A: { ID: 42, N: 'Known Runner' } },
    { L: 2, A: { N: 'Name Only' } }
  ], '8920', '5-1', 'entry');
  assert.equal(legs[0].source_athlete_key, '42');
  assert.match(legs[1].source_athlete_key, /^8920\|event=5-1\|entry=entry\|leg=2\|name=Name Only$/);
});

test('source-date validation accepts either day of an inclusive multi-day meet', () => {
  assert.doesNotThrow(() => assertSourceDate({
    meta: { startDate: '2026-05-01T00:00:00', endDate: '2026-05-02T00:00:00' }
  }, { date: '2026-05-02', end_date: '2026-05-02' }));
  assert.throws(() => assertSourceDate({
    meta: { startDate: '2026-05-01T00:00:00', endDate: '2026-05-01T00:00:00' }
  }, { date: '2026-05-02', end_date: '2026-05-02' }), /source_date_mismatch/);
});

test('MileSplit timer listings resolve by canonical date and exact normalized name', () => {
  const selected = selectMileSplitTimerMeet([
    { id: '730114', name: 'Fastrack', dateStart: '2026-02-06' },
    { id: '730380', name: 'Big Apple Invitational', dateStart: '2026-02-07' },
  ], { name: 'Fastrack National Invitational', date: '2026-02-06' });
  assert.equal(selected.id, '730114');
});

test('MileSplit timer listings reject same-day ambiguity instead of guessing', () => {
  assert.throws(() => selectMileSplitTimerMeet([
    { id: '1', name: 'Morning Session', dateStart: '2026-04-04' },
    { id: '2', name: 'Afternoon Session', dateStart: '2026-04-04' },
  ], { name: 'Different Meet', date: '2026-04-04' }), /source_timer_match_ambiguous/);
});
