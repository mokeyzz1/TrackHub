const test = require('node:test');
const assert = require('node:assert/strict');

const { CanonicalFactWriter, linkedTarget, nullableInteger } = require('./canonical_fact_writer');

test('does not put source-specific string event codes into integer legacy event_id columns', () => {
  assert.equal(nullableInteger('4x100m'), null);
  assert.equal(nullableInteger('1234'), 1234);
  assert.equal(nullableInteger(5678), 5678);
  assert.equal(nullableInteger(''), null);
});

test('only accepts one valid canonical source-link target', () => {
  assert.deepEqual(linkedTarget(123, null), { resultId: 123, relayResultId: null });
  assert.deepEqual(linkedTarget(null, 456), { resultId: null, relayResultId: 456 });
  assert.equal(linkedTarget(null, null), null);
  assert.equal(linkedTarget(123, 456), null);
});

test('reconciles a resolved relay leg onto its existing parent relay', async () => {
  const calls = [];
  const client = {
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes('SELECT sl.relay_result_id')) return { rows: [{ relay_result_id: 242867 }] };
      return { rowCount: 1 };
    }
  };
  const writer = new CanonicalFactWriter({ pool: {}, env: { INGEST_DATABASE_URL: 'postgresql://test' } });

  const updated = await writer.reconcileRelayLeg(client, {
    source: 'tfrrs',
    target_athlete_id: 61772,
    payload: {
      relay_parent_source_record_key: 'parent-record',
      leg: { leg_order: 4, tfrrs_athlete_id: '9166975' }
    }
  });

  assert.equal(updated, 1);
  assert.deepEqual(calls[1].params, [61772, 242867, 4, '9166975']);
});

test('batches preclassified quarantine bookkeeping', async () => {
  const calls = [];
  const client = {
    query: async (text, params) => {
      calls.push({ text, params });
      return { rows: [], rowCount: 1 };
    },
  };
  const writer = new CanonicalFactWriter({ pool: {}, env: { INGEST_DATABASE_URL: 'postgresql://test' } });

  const count = await writer.quarantineExistingRows(client, [
    { observation_id: 101 },
    { observation_id: 102 },
  ]);

  assert.equal(count, 2);
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /validation_errors->0->>'code'/);
  assert.deepEqual(calls[0].params, [[101, 102]]);
});
