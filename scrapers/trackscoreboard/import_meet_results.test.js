const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractRelayRows,
  parseSourceUrl,
  sourceEventName,
} = require('./import_meet_results');

test('normalizes TrackScoreboard event phrases without collapsing mixed relays', () => {
  assert.equal(sourceEventName("Women's 4x100 Relay"), '4 x 100 Relay');
  assert.equal(sourceEventName("Men's 4x110 Shuttle Hurdle Relay"), '4x110 Shuttle Hurdles');
  assert.equal(sourceEventName('Mixed 4x400 Relay'), 'Mixed 4x400m Relay');
  assert.equal(sourceEventName('Womens 1600 Mixto Corto'), '1600m Mixto Corto');
  assert.equal(sourceEventName('Mens 4000 Mixto Largo'), '4000m Mixto Largo');
});

test('normalizes accent differences without weakening exact identity matching', () => {
  const { normalizeName } = require('./import_meet_results');
  assert.equal(normalizeName('José Rodríguez'), 'jose rodriguez');
  assert.equal(normalizeName('Jose Rodriguez'), 'jose rodriguez');
});

test('extracts each nested relay result once', () => {
  const rows = extractRelayRows({
    results: [
      {
        id: 10,
        teamName: 'UPR MAYAGUEZ',
        teamsAbbr: 'UPRM',
        mark: '46.78',
        place: 1,
        athletes: [{ id: 1, fname: 'A', lname: 'Runner' }],
      },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].teamName, 'UPR MAYAGUEZ');
});

test('accepts only canonical TrackScoreboard meet URLs', () => {
  assert.deepEqual(parseSourceUrl('https://tiempo.trackscoreboard.com/meets/734'), {
    url: 'https://tiempo.trackscoreboard.com/meets/734',
    host: 'tiempo.trackscoreboard.com',
    sourceMeetId: 734,
  });
  assert.throws(
    () => parseSourceUrl('https://example.com/meets/734'),
    /unsupported TrackScoreboard URL/
  );
});
