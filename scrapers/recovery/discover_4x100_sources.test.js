const test = require('node:test');
const assert = require('node:assert/strict');

const {
  chooseAthleticCandidate,
  chooseExactTfrrsCandidate,
  crawlTfrrsIndex,
  locationOverlap,
  normalizeMeetName,
  parseTfrrsLocation,
  parseArgs,
  parseTfrrsDate,
  parseTfrrsSearchPage,
  targetDateMatches,
  verifyTfrrsCandidateLocation,
} = require('./discover_4x100_sources');

test('source discovery requires an explicit scope and defaults to Outdoor 2026', () => {
  const args = parseArgs(['--scope', 'outdoor-2026-4x100']);
  assert.equal(args.scope, 'outdoor-2026-4x100');
  assert.equal(args.season, 'Outdoor 2026');
  assert.equal(args.from, '2026-04-01');
  assert.equal(args.to, '2026-06-27');
  assert.equal(args.source, 'auto');
  assert.equal(args.meetId, null);
  assert.equal(args.stage, false);
});

test('source discovery accepts the worker primary policy', () => {
  const args = parseArgs(['--scope', 'primary', '--source', 'primary']);
  assert.equal(args.source, 'primary');
  assert.equal(args.blockedOnly, false);
  assert.equal(parseArgs(['--scope', 'primary', '--blocked-only']).blockedOnly, true);
});

test('meet name normalization removes year and punctuation without losing identity', () => {
  assert.equal(normalizeMeetName("2026 Grubby's Track Meet"), 'grubbys track meet');
  assert.equal(normalizeMeetName('2026 Grubbys Track Meet'), 'grubbys track meet');
});

test('TFRRS date parser handles single and ranged dates', () => {
  assert.equal(parseTfrrsDate('04/24/26'), '2026-04-24');
  assert.equal(parseTfrrsDate('04/24-25/26'), '2026-04-24');
  assert.equal(parseTfrrsDate('01/31-02/01/26'), '2026-01-31');
  assert.equal(parseTfrrsDate('not a date'), null);
});

test('TFRRS search page parser extracts only result links and first event date', () => {
  const html = `
    <table><tbody>
      <tr><td>04/24-25/26</td><td><a href="/results/12345">  Pepsi Florida Relays </a></td><td>Florida</td></tr>
      <tr><td>04/25/26</td><td><a href="/teams/123">Not a meet</a></td><td>Florida</td></tr>
      <tr><td>04/26/26</td><td><a href="/results/12346">Drake Relays</a></td><td>Drake</td></tr>
    </tbody></table>`;
  assert.deepEqual(parseTfrrsSearchPage(html), [
    {
      source: 'tfrrs',
      tfrrs_id: '12345',
      name: 'Pepsi Florida Relays',
      date: '2026-04-24',
      url: 'https://www.tfrrs.org/results/12345',
    },
    {
      source: 'tfrrs',
      tfrrs_id: '12346',
      name: 'Drake Relays',
      date: '2026-04-26',
      url: 'https://www.tfrrs.org/results/12346',
    },
  ]);
});

test('TFRRS location verification rejects a same-name meet in another location', async () => {
  const result = await verifyTfrrsCandidateLocation(
    { location: 'Pullman, WA * Mooberry Track & Field Complex' },
    { url: 'https://www.tfrrs.org/results/96309' },
    async () => ({ data: `
      <div class="panel-heading-normal-text">04/25/26</div>
      <div class="panel-heading-normal-text">Concordia (Ill.) - River Forest, IL</div>` })
  );
  assert.equal(result.status, 'not_found');
  assert.equal(result.reason, 'tfrrs_location_mismatch');
  assert.equal(parseTfrrsLocation('<div class="panel-heading-normal-text">Concordia (Ill.) - River Forest, IL</div>'), 'Concordia (Ill.) - River Forest, IL');
});

test('TFRRS candidate matching requires one exact normalized name in the date window', () => {
  const target = { name: 'Pepsi Florida Relays', date: '2026-04-24', end_date: '2026-04-25' };
  const candidates = [
    { name: '2026 Pepsi Florida Relays', date: '2026-04-24', url: 'https://www.tfrrs.org/results/1' },
    { name: 'Pepsi Florida Relays', date: '2026-04-24', url: 'https://www.tfrrs.org/results/2' },
  ];
  assert.equal(chooseExactTfrrsCandidate(target, candidates).status, 'ambiguous');
  assert.equal(chooseExactTfrrsCandidate(target, [candidates[0]]).status, 'verified');
  assert.equal(chooseExactTfrrsCandidate(target, [{ ...candidates[0], date: '2026-08-01' }]).status, 'not_found');
  assert.equal(targetDateMatches(target, { date: '2026-04-25' }), true);
});

test('Athletic.net candidate matching uses exact name/year and unique location evidence', () => {
  const target = { name: 'Pepsi Florida Relays', date: '2026-04-24', location: 'Gainesville, FL' };
  const docs = [
    { type: 'TFMeet', id_db: 642160, textsuggest: '2026 Pepsi Florida Relays', subtext: 'University of Florida||Gainesville, FL', tf: 2026 },
    { type: 'TFMeet', id_db: 123456, textsuggest: '2026 Pepsi Florida Relays', subtext: 'Somewhere else||Orlando, FL', tf: 2026 },
    { type: 'Other', id_db: 777, textsuggest: '2026 Pepsi Florida Relays', subtext: 'Gainesville, FL', tf: 2026 },
  ];
  const result = chooseAthleticCandidate(target, docs);
  assert.equal(result.status, 'verified');
  assert.equal(result.candidate.id_db, 642160);
  assert.deepEqual(result.location_overlap, ['gainesville', 'fl']);
  assert.equal(chooseAthleticCandidate(target, docs.slice(0, 1)).status, 'verified');
  assert.equal(chooseAthleticCandidate(target, [{ ...docs[0], id_db: null }]).status, 'not_found');
  assert.equal(chooseAthleticCandidate({ ...target, location: 'Unknown' }, docs.slice(0, 2)).status, 'ambiguous');
  assert.deepEqual(locationOverlap('Gainesville, FL', 'University of Florida||Gainesville, FL'), ['gainesville', 'fl']);
});

test('TFRRS index crawl stops after the first page older than the requested range', async () => {
  const pages = [
    `<table><tbody><tr><td>04/24/26</td><td><a href="/results/1">Pepsi Florida Relays</a></td></tr></tbody></table>`,
    `<table><tbody><tr><td>03/01/26</td><td><a href="/results/2">Older Meet</a></td></tr></tbody></table>`,
  ];
  const requested = [];
  const rows = await crawlTfrrsIndex({
    from: '2026-04-01',
    to: '2026-04-30',
    delayMs: 0,
    maxPages: 10,
    get: async url => {
      requested.push(url);
      return { data: pages[requested.length - 1] || '' };
    },
  });
  assert.equal(requested.length, 2);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tfrrs_id, '1');
});
