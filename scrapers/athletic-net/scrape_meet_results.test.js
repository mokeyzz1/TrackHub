const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AthleticNetSourceBlockedError,
  detectSourceBlock,
  normalizeEventResultLink,
} = require('./scrape_meet_results');

test('detects an athletic.net Cloudflare block response', () => {
  const reason = detectSourceBlock({
    status: 403,
    title: 'Attention Required! | Cloudflare',
    body: 'Sorry, you have been blocked',
  });
  assert.equal(reason, 'HTTP 403');
  assert.equal(new AthleticNetSourceBlockedError({ status: 403, reason }).code, 'SOURCE_BLOCKED');
});

test('detects a Cloudflare page even when the browser reports HTTP 200', () => {
  assert.equal(
    detectSourceBlock({
      status: 200,
      title: 'Attention Required! | Cloudflare',
      body: 'Sorry, you have been blocked',
    }),
    'Cloudflare block page'
  );
});

test('does not classify a normal empty results page as blocked', () => {
  assert.equal(
    detectSourceBlock({ status: 200, title: 'Jim Barber Invitational', body: 'No results posted' }),
    null
  );
});

test('canonicalizes all-results links and removes split-query duplicates', () => {
  assert.deepEqual(
    normalizeEventResultLink(
      '/TrackAndField/meet/668595/results/m/1/800m?tab=splits',
      '800 Meters'
    ),
    {
      url: 'https://www.athletic.net/TrackAndField/meet/668595/results/m/1/800m',
      gender: 'm',
      divId: '1',
      eventCode: '800m',
      divLabel: '800 Meters',
    }
  );
});
