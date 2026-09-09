const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifySourceUrl,
  recoverySourceFromUrl,
} = require('./source_provider');

test('classifies supported TFRRS and Athletic-family URLs by host and path', () => {
  assert.deepEqual(classifySourceUrl('https://www.tfrrs.org/results/96496'), {
    url: 'https://www.tfrrs.org/results/96496',
    provider: 'tfrrs',
    source: 'tfrrs',
    capability: 'supported',
    reason: null,
  });
  assert.equal(classifySourceUrl('https://live.athletic.net/meets/68768').source, 'athletic_net');
  assert.equal(classifySourceUrl('https://results.blacksquirreltiming.com/meets/65497').capability, 'supported');
  assert.equal(classifySourceUrl('https://live.jdlfasttrack.com/meets/54336').capability, 'supported');
});

test('recognizes supported timing adapters and preserves policy exclusions', () => {
  const milesplit = classifySourceUrl('https://milesplit.live/meets/722808');
  assert.equal(milesplit.provider, 'milesplit');
  assert.equal(milesplit.capability, 'supported');
  assert.equal(milesplit.source, 'milesplit');

  const ptTiming = classifySourceUrl('https://live.pttiming.com/?mid=8642');
  assert.equal(ptTiming.capability, 'supported');
  assert.equal(ptTiming.source, 'pt_timing');

  const leone = classifySourceUrl('https://results.leonetiming.com/?mid=8920');
  assert.equal(leone.capability, 'supported');
  assert.equal(leone.source, 'leonetiming');

  const blueRidge = classifySourceUrl('https://blueridgetiming.live/meets/66890');
  assert.equal(blueRidge.capability, 'supported');
  assert.equal(blueRidge.source, 'athletic_net');

  const trackscoreboard = classifySourceUrl('https://finishedresults.trackscoreboard.com/meets/13452/events');
  assert.equal(trackscoreboard.provider, 'trackscoreboard');
  assert.equal(trackscoreboard.capability, 'policy_excluded');
});

test('does not use substring matches to misclassify unrelated hosts', () => {
  const result = classifySourceUrl('https://example.com/athletic.net/TrackAndField/meet/123/results');
  assert.equal(result.provider, 'other');
  assert.equal(result.capability, 'adapter_required');
});

test('only returns a recovery source for a supported requested adapter', () => {
  assert.deepEqual(
    recoverySourceFromUrl('https://results.blacksquirreltiming.com/meets/65497', 'auto'),
    {
      source: 'athletic_net',
      url: 'https://results.blacksquirreltiming.com/meets/65497',
      provider: 'athletic_net',
    }
  );
  assert.deepEqual(recoverySourceFromUrl('https://milesplit.live/meets/722808', 'auto'), {
    source: 'milesplit',
    url: 'https://milesplit.live/meets/722808',
    provider: 'milesplit'
  });
  assert.deepEqual(recoverySourceFromUrl('https://live.pttiming.com/?mid=8642', 'auto'), {
    source: 'pt_timing',
    url: 'https://live.pttiming.com/?mid=8642',
    provider: 'pt_timing'
  });
  assert.equal(recoverySourceFromUrl('https://milesplit.live/meets/722808', 'athletic_net'), null);
  assert.equal(recoverySourceFromUrl('https://www.tfrrs.org/results/96496', 'athletic_net'), null);
});
