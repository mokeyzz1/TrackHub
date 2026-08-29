const test = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');

const {
  extractTfrrsRowIdentity,
  findTeamIdBySourceName,
  getGenderFromEventUrl,
  parseMultiEventSummary,
  parseRelayAthleteNames,
  tfrrsApiEventUrl,
} = require('./sync-weekend-results');

test('resolves a unique school-name variant but leaves ambiguous labels unresolved', () => {
  const teams = new Map([
    ['riverside city college|M', 101],
    ['riverside city college|F', 102],
    ['southwestern cc|M', 201],
    ['southwestern tx|M', 202],
  ]);

  assert.equal(findTeamIdBySourceName(teams, 'Riverside City', 'M'), 101);
  assert.equal(findTeamIdBySourceName(teams, 'Southwestern', 'M'), null);
  assert.equal(findTeamIdBySourceName(teams, 'Riverside City College', 'F'), 102);
  assert.equal(findTeamIdBySourceName(new Map([['san diego|M', 301]]), 'San Diego Mesa', 'M'), null);
});

test('derives gender from the TFRRS event URL when display text is gender-neutral', () => {
  assert.equal(
    getGenderFromEventUrl('https://www.tfrrs.org/results/96740/5992121/2025_3C2A/Mens-100-Meters'),
    'M'
  );
  assert.equal(
    getGenderFromEventUrl('https://www.tfrrs.org/results/96740/5992122/2025_3C2A/Womens-100-Meters'),
    'F'
  );
  assert.equal(getGenderFromEventUrl('https://www.tfrrs.org/results/96740/5992121/2025_3C2A/100-Meters'), null);
});

test('uses the official TFRRS API summary POINTS column for aggregate multi-events', () => {
  const eventUrl = 'https://www.tfrrs.org/results/96740/5992116/2025_3C2A/Mens-Decathlon';
  const $ = cheerio.load(`
    <table><thead><tr><th>PL</th><th>NAME</th><th>YEAR</th><th>TEAM</th>
      <th>POINTS</th><th>POINTS</th><th>POINTS</th><th>POINTS</th><th>SC</th>
    </tr></thead><tbody><tr>
      <td>1</td><td>Taiyo Ishiguro</td><td>Fr</td><td>Mt. SAC</td>
      <td>6668</td><td>7201</td><td>5667</td><td>8468</td><td>10</td>
    </tr></tbody></table>
  `);

  const [row] = parseMultiEventSummary($, {
    eventUrl,
    fetchUrl: tfrrsApiEventUrl(eventUrl),
    meetId: 96740,
    meetName: '3C2A',
    meetDate: '2026-05-09',
    eventName: 'Decathlon',
    dbMeetId: 12952,
    dbMeetName: '3C2A',
  });

  assert.equal(tfrrsApiEventUrl(eventUrl).startsWith('https://api.tfrrs.org/'), true);
  assert.equal(row.points, 6668);
  assert.equal(row.mark_raw, '6668');
  assert.equal(row.mark_seconds, null);
  assert.equal(row.team_gender, 'M');
  assert.equal(row.multi_event_summary, true);
});

test('extracts current plain-cell TFRRS individual identities', () => {
  const $ = cheerio.load(`
    <table><thead><tr><th>PL</th><th>NAME</th><th>YEAR</th><th>TEAM</th><th>TIME</th></tr></thead><tbody><tr>
      <td>19</td><td> Aaron Lujan </td><td>So</td><td> Riverside City </td><td>10.85</td>
    </tr></tbody></table>
  `);

  assert.deepEqual(extractTfrrsRowIdentity($, $('tr'), { isRelay: false }), {
    athleteId: null,
    athleteName: 'Aaron Lujan',
    schoolName: 'Riverside City',
    teamInfo: null,
  });
});

test('extracts current plain-cell TFRRS relay identities with squad columns', () => {
  const $ = cheerio.load(`
    <table><thead><tr><th>PL</th><th>TEAM</th><th>SQUAD</th><th>ATHLETES</th><th>TIME</th></tr></thead><tbody><tr>
      <td>1</td><td> San Diego Mesa </td><td>A</td>
      <td> Matthew Robertson, Ryan Mann, Austin Snook, Elliot Getz </td><td>40.66</td>
    </tr></tbody></table>
  `);

  assert.deepEqual(extractTfrrsRowIdentity($, $('tr'), { isRelay: true }), {
    athleteId: null,
    athleteName: null,
    schoolName: 'San Diego Mesa',
    teamInfo: null,
    relayAthletes: [
      { athleteId: null, name: 'Matthew Robertson' },
      { athleteId: null, name: 'Ryan Mann' },
      { athleteId: null, name: 'Austin Snook' },
      { athleteId: null, name: 'Elliot Getz' },
    ],
  });
});

test('parses compact relay athlete cells without retaining presentation whitespace', () => {
  assert.deepEqual(
    parseRelayAthleteNames(' Robertson,  Mann, Snook, Getz '),
    ['Robertson', 'Mann', 'Snook', 'Getz']
  );
});
