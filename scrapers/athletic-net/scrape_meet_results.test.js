const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AthleticNetSourceBlockedError,
  athleticLiveResultAvailable,
  detectSourceBlock,
  normalizeEventResultLink,
  parseAthleticLiveEventLink,
  athleticLiveEventCode,
  athleticLiveGender,
  parseAthleticLivePayload,
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
    'Cloudflare challenge page'
  );
});

test('detects the current Cloudflare challenge page returned by Athletic.net', () => {
  assert.equal(
    detectSourceBlock({
      status: 200,
      title: 'Just a moment...',
      body: 'Enable JavaScript and cookies to continue',
    }),
    'Cloudflare challenge page'
  );
});

test('detects Cloudflare response headers even when the body is not available', () => {
  assert.equal(
    detectSourceBlock({ status: 200, headers: { 'cf-mitigated': 'challenge' } }),
    'Cloudflare response'
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

test('parses AthleticLIVE result links and excludes scheduled rows', () => {
  const result = parseAthleticLiveEventLink(
    '/meets/73399/events/relay/489755',
    'Results Men 4x100mR',
    'https://live.athletic.net'
  );
  assert.deepEqual(result, {
    url: 'https://live.athletic.net/meets/73399/events/relay/489755',
    liveMeetId: '73399',
    liveEventType: 'relay',
    liveEventId: '489755',
    rowText: 'Results Men 4x100mR',
    resultAvailable: true,
  });
  assert.equal(athleticLiveResultAvailable('Official Women 1500m Prelims Fri 3:00 PM'), true);
  assert.equal(athleticLiveResultAvailable('Completed Men 100m Finals'), true);
  assert.equal(
    parseAthleticLiveEventLink(
      '/meets/73399/events/relay/489746',
      'Scheduled Women 4x100mR',
      'https://live.athletic.net'
    ).resultAvailable,
    false
  );
  assert.equal(athleticLiveResultAvailable('Entries Women 100m Scheduled'), false);
});

test('normalizes AthleticLIVE event abbreviations and gender', () => {
  assert.equal(athleticLiveEventCode({ ab: '4x100mR' }), '4x100m');
  assert.equal(athleticLiveEventCode({ ab: '3000m SC' }), '3000m SC');
  assert.equal(athleticLiveEventCode({ n: 'Women Heptathlon Javelin Throw' }), 'Javelin');
  assert.equal(athleticLiveEventCode({ n: 'Men Decathlon 110m Hurdles' }), '110m H');
  assert.equal(athleticLiveEventCode({ ab: 'LJ' }), 'Long Jump');
  assert.equal(athleticLiveGender({ g: 'Male', gl: 'Men' }), 'm');
  assert.equal(athleticLiveGender({ g: 'Female', gl: 'Women' }), 'f');
});

test('maps AthleticLIVE open labels into verified event aliases', () => {
  assert.equal(athleticLiveEventCode({ n: '60m Hurdles Open' }), '60 Meter Hurdles Open');
  assert.equal(athleticLiveEventCode({ n: '60m Open' }), '60 Meters Open');
  assert.equal(athleticLiveEventCode({ n: '200m Open' }), '200 Meters Open');
  assert.equal(athleticLiveEventCode({ n: '300m Hurdles Open' }), '300 Hurdles');
  assert.equal(athleticLiveEventCode({ n: '400m Open' }), '400 Meters Open');
  assert.equal(athleticLiveEventCode({ n: '800m Open' }), '800 Meters Open');
  assert.equal(athleticLiveEventCode({ n: '3000m Open' }), '3000 Meters Open');
  assert.equal(athleticLiveEventCode({ n: '4x400m Relay Open' }), '4 x 400 Relay Open');
});

test('maps AthleticLIVE individual payloads with source keys, not guessed profile IDs', () => {
  const result = parseAthleticLivePayload({
    _source: {
      ab: '3000m SC',
      g: 'Male',
      gl: 'Men',
      i: 2734076,
      mi: 73399,
      n: 'Men 3000m Steeplechase',
      runm: 'Finals',
      r: [{
        p: '2',
        m: '9:53.41',
        w: null,
        a: {
          i: 49173244,
          n: 'Nick Wong',
          y: 'SR',
          t: { i: 1650209, n: 'Mount Union' },
        },
      }],
    },
  }, {
    url: 'https://live.athletic.net/meets/73399/events/individual/2734076',
    liveMeetId: '73399',
    liveEventId: '2734076',
    liveEventType: 'individual',
  });

  assert.equal(result.eventCode, '3000m SC');
  assert.equal(result.gender, 'm');
  assert.equal(result.round, 'Finals');
  assert.deepEqual(result.results[0], {
    place: '2',
    athlete_name: 'Nick Wong',
    source_athlete_key: '49173244',
    athletic_live_athlete_id: '49173244',
    team_name: 'Mount Union',
    source_team_key: '1650209',
    athletic_live_team_id: '1650209',
    mark_raw: '9:53.41',
    wind: null,
    points: undefined,
    round: 'Finals',
    year_in_school: 'SR',
    is_pr: false,
  });
});

test('maps AthleticLIVE relay payloads with ordered source keys', () => {
  const result = parseAthleticLivePayload({
    _source: {
      ab: '4x100mR',
      ec: 'Relay',
      g: 'Male',
      gl: 'Men',
      i: 489755,
      mi: 73399,
      n: 'Men 4x100m Relay',
      runm: 'Finals',
      rts: [{
        p: '1',
        m: '41.13',
        rd: 'A',
        t: { i: 1650209, n: 'Mount Union' },
        rm: [
          { to: 1, a: { i: 49173513, n: 'Josiah Hunter' } },
          { to: 2, a: { i: 49174069, n: 'Donovan Geiger' } },
        ],
      }],
    },
  }, {
    url: 'https://live.athletic.net/meets/73399/events/relay/489755',
    liveMeetId: '73399',
    liveEventId: '489755',
    liveEventType: 'relay',
  });

  assert.equal(result.eventCode, '4x100m');
  assert.equal(result.results[0].team_name, 'Mount Union');
  assert.equal(result.results[0].round, 'Finals');
  assert.deepEqual(result.results[0].legs, [
    { leg_order: 1, athlete_name: 'Josiah Hunter', source_athlete_key: '49173513', athletic_live_athlete_id: '49173513' },
    { leg_order: 2, athlete_name: 'Donovan Geiger', source_athlete_key: '49174069', athletic_live_athlete_id: '49174069' },
  ]);
});
