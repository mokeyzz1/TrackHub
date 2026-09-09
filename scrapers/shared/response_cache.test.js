const test = require('node:test');
const assert = require('node:assert/strict');
const { ResponseCache } = require('./response_cache');

test('response cache shares concurrent loads and reuses the result', async () => {
  const cache = new ResponseCache({ ttlMs: 1000 });
  let calls = 0;
  const loader = async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return { html: 'historical page' };
  };

  const [first, second] = await Promise.all([
    cache.get('https://example.test/meet', loader),
    cache.get('https://example.test/meet', loader),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.equal(cache.stats().hits, 1);
  assert.equal(cache.stats().misses, 1);
  assert.deepEqual(await cache.get('https://example.test/meet', loader), first);
  assert.equal(calls, 1);
});

test('response cache does not retain failed loads', async () => {
  const cache = new ResponseCache({ ttlMs: 1000 });
  let calls = 0;
  await assert.rejects(cache.get('bad', async () => {
    calls++;
    throw new Error('network failure');
  }), /network failure/);
  assert.equal(cache.stats().entries, 0);
  await assert.rejects(cache.get('bad', async () => {
    calls++;
    throw new Error('network failure');
  }), /network failure/);
  assert.equal(calls, 2);
});
