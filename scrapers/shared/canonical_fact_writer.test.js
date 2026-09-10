const test = require('node:test');
const assert = require('node:assert/strict');

const { CanonicalFactWriter, linkedTarget, nullableInteger, promotionLockKeys } = require('./canonical_fact_writer');

test('promotion locks cover source replay, same-meet facts and cross-meet history claims', () => {
  const row = { source_record_id: 7, target_meet_id: 10, target_athlete_id: 20, event_type_id: 3 };
  const keys = promotionLockKeys([row, row]);
  assert.equal(keys.length, 3);
  assert.deepEqual(keys, promotionLockKeys([row]).sort());
  assert.ok(keys.includes('trackhub:fact:athlete:20:event:3'));
  assert.ok(promotionLockKeys([{ ...row, target_meet_id: 11 }]).includes('trackhub:fact:athlete:20:event:3'));
  assert.deepEqual(promotionLockKeys([{}]), []);
});

test('does not put source-specific string event codes into integer legacy event_id columns', () => {
  assert.equal(nullableInteger('4x100m'), null);
  assert.equal(nullableInteger('1234'), 1234);
  assert.equal(nullableInteger(5678), 5678);
  assert.equal(nullableInteger(''), null);
});

test('only accepts one valid canonical source-link target', () => {
  assert.deepEqual(linkedTarget(123, null), {
    resultId: 123, relayResultId: null, relayAthleteId: null,
  });
  assert.deepEqual(linkedTarget(null, 456), {
    resultId: null, relayResultId: 456, relayAthleteId: null,
  });
  assert.deepEqual(linkedTarget(null, null, 789), {
    resultId: null, relayResultId: null, relayAthleteId: 789,
  });
  assert.equal(linkedTarget(null, null), null);
  assert.equal(linkedTarget(123, 456), null);
  assert.equal(linkedTarget(123, null, 789), null);
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

test('resolves a relay-leg observation to its membership rather than an individual result', async () => {
  const calls = [];
  const client = {
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes('SELECT ra.relay_athlete_id')) return { rows: [{ relay_athlete_id: 987 }] };
      if (text.includes('SELECT sl.relay_result_id')) return { rows: [{ relay_result_id: 654 }] };
      return { rowCount: 1 };
    },
  };
  const writer = new CanonicalFactWriter({ pool: {}, env: { INGEST_DATABASE_URL: 'postgresql://test' } });
  const target = await writer.resolveRelayLegTarget(client, {
    source: 'athletic_net',
    target_athlete_id: 321,
    payload: {
      relay_parent_source_record_key: 'relay-parent',
      leg: { leg_order: 2, athletic_net_athlete_id: 'anet-321' },
    },
  });
  assert.equal(target, 987);
  assert.match(calls[0].text, /JOIN public\.relay_athletes/);
  assert.deepEqual(calls[0].params, ['athletic_net', 'relay-parent', 2]);
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
