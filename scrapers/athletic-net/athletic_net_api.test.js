const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AthleticNetApiError,
  AthleticNetSearchClient,
  isHtmlResponse,
} = require('./athletic_net_api');

function response(body, { status = 200, contentType = 'application/json', headers = {} } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'content-type') return contentType;
        return headers[name] || headers[name.toLowerCase()] || '';
      }
    },
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  };
}

test('caches validated search responses by sport and normalized query', async () => {
  let calls = 0;
  const client = new AthleticNetSearchClient({
    minDelayMs: 0,
    fetchImpl: async () => {
      calls++;
      return response({ response: { docs: [{ type: 'Athlete', id_db: '123' }] } });
    }
  });

  const first = await client.search('  Ryan Palmer ');
  const second = await client.search('ryan palmer');
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
});

test('classifies an HTML/Cloudflare response instead of trying to parse it as JSON', async () => {
  const client = new AthleticNetSearchClient({
    minDelayMs: 0,
    maxRetries: 0,
    fetchImpl: async () => response('<!doctype html><html>blocked</html>', { contentType: 'text/html' })
  });

  await assert.rejects(
    () => client.search('Aaron Dickhart'),
    error => error instanceof AthleticNetApiError && error.code === 'HTML_RESPONSE'
  );
  assert.equal(isHtmlResponse('application/json', '<html>blocked</html>'), true);
});

test('retries a temporary server error and then validates the JSON shape', async () => {
  let calls = 0;
  const sleeps = [];
  const client = new AthleticNetSearchClient({
    minDelayMs: 0,
    maxRetries: 1,
    retryBackoffMs: 7,
    sleepImpl: async ms => sleeps.push(ms),
    fetchImpl: async () => {
      calls++;
      return calls === 1
        ? response('temporary', { status: 503 })
        : response({ response: { docs: [] } });
    }
  });

  const result = await client.search('Bella Hodges');
  assert.deepEqual(result.response.docs, []);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [7]);
});

test('rejects a successful response with the wrong schema', async () => {
  const client = new AthleticNetSearchClient({
    minDelayMs: 0,
    maxRetries: 0,
    fetchImpl: async () => response({ results: [] })
  });

  await assert.rejects(
    () => client.search('Unknown Athlete'),
    error => error instanceof AthleticNetApiError && error.code === 'INVALID_SCHEMA'
  );
});
