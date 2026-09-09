const test = require('node:test');
const assert = require('node:assert/strict');
const {
  correctionUpdates,
  linkedTarget,
  parseArgs,
  validateCorrection,
} = require('./apply_source_correction');
const { applyCorrection } = require('./apply_source_correction');

const base = {
  decision: 'quarantine',
  quarantine_status: 'open',
  reason_code: 'source_correction_required',
  source_snapshot_hash: 'a'.repeat(64),
  snapshot_hash: 'a'.repeat(64),
  entity_type: 'individual_result',
  target_meet_id: 20,
  target_athlete_id: 30,
  target_team_id: 40,
  event_type_id: 50,
  event_code: '100m',
  raw_event_name: '100 Meters',
  measure: 'time',
  mark_raw: '10.40',
  mark_seconds: 10.4,
  mark_meters: null,
  place: 2,
  result_date: '2026-09-02',
  linked_result_id: 99,
  linked_relay_result_id: null,
  linked_entity_type: 'individual_result',
  linked_fact: {
    result_id: 99, meet_id: 19, athlete_id: 30, team_id: 40, event_type_id: 50,
    event_name: '100m', mark_raw: '10.50', mark_seconds: 10.5, mark_meters: null,
    place: 2, date: '2026-09-01',
  },
};

test('source correction CLI requires explicit operation and commit', () => {
  assert.throws(() => parseArgs([]), /--observation-id/);
  assert.throws(() => parseArgs(['--observation-id', '1', '--operation-key', 'op1']), /--dry-run or --commit/);
  assert.deepEqual(parseArgs(['--observation-id', '12', '--operation-key', 'corr_1', '--commit', '--operator', 'Kim']), {
    observationId: 12, operationKey: 'corr_1', operator: 'Kim', commit: true,
  });
  assert.equal(parseArgs(['--observation-id', '12', '--operation-key', 'corr_1', '--dry-run']).commit, false);
});

test('validation accepts a linked immutable individual correction', () => {
  assert.deepEqual(validateCorrection(base), {
    target: { table: 'public.results', id: 99, kind: 'result' },
    fields: ['meet', 'mark', 'date'],
  });
  assert.deepEqual(correctionUpdates(base, ['meet', 'mark', 'date']), {
    meet_id: 20, mark_raw: '10.40', mark_seconds: 10.4, mark_meters: null,
    date: '2026-09-02',
  });
});

test('validation holds identity and relay-lineup changes', () => {
  assert.throws(() => validateCorrection({ ...base, target_athlete_id: 31 }), /unsupported source correction fields: athlete/);
  assert.throws(() => validateCorrection({ ...base, entity_type: 'relay_leg' }), /relay-leg corrections/);
  assert.equal(linkedTarget({ linked_result_id: null, linked_relay_result_id: null }), null);
});

test('validation rejects a missing snapshot or closed quarantine', () => {
  assert.throws(() => validateCorrection({ ...base, source_snapshot_hash: null }), /immutable source snapshot/);
  assert.throws(() => validateCorrection({ ...base, quarantine_status: 'resolved' }), /quarantine must be open/);
});

function fakePool({ updateRowCount = 1 } = {}) {
  const queries = [];
  const client = {
    async query(text, values) {
      queries.push({ text, values });
      if (/^SELECT o\./.test(text)) return { rows: [base] };
      if (/SELECT to_jsonb\(r\)/.test(text)) return { rowCount: 1, rows: [{ fact: base.linked_fact }] };
      if (/SELECT archive_id/.test(text)) return { rowCount: 0, rows: [] };
      if (/UPDATE public\./.test(text)) return { rowCount: updateRowCount, rows: updateRowCount ? [{ result_id: 99 }] : [] };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  return { queries, async connect() { return client; } };
}

test('applyCorrection archives before-image and resolves the review atomically', async () => {
  const pool = fakePool();
  const result = await applyCorrection({
    observationId: 12,
    operationKey: 'corr_1',
    operator: 'Kim',
    pool,
  });
  assert.deepEqual(result.fields, ['meet', 'mark', 'date']);
  assert.equal(pool.queries[0].text, 'BEGIN ISOLATION LEVEL READ COMMITTED');
  assert.equal(pool.queries.at(-1).text, 'COMMIT');
  assert.equal(pool.queries.filter(query => /INSERT INTO ingest\.fact_cleanup_archive/.test(query.text)).length, 1);
  assert.equal(pool.queries.filter(query => /UPDATE public\.results/.test(query.text)).length, 1);
  assert.equal(pool.queries.filter(query => /UPDATE ingest\.observations/.test(query.text)).length, 1);
  assert.equal(pool.queries.filter(query => /UPDATE ingest\.quarantine/.test(query.text)).length, 1);
});

test('dry-run correction returns the plan and rolls back before any write', async () => {
  const pool = fakePool();
  const result = await applyCorrection({
    observationId: 12,
    operationKey: 'corr_dry_run',
    operator: 'Kim',
    commit: false,
    pool,
  });
  assert.equal(result.committed, false);
  assert.deepEqual(result.fields, ['meet', 'mark', 'date']);
  assert.equal(pool.queries.at(-1).text, 'ROLLBACK');
  assert.equal(pool.queries.some(query => /INSERT INTO ingest\.fact_cleanup_archive/.test(query.text)), false);
  assert.equal(pool.queries.some(query => /UPDATE public\./.test(query.text)), false);
});

test('applyCorrection rolls back if the canonical fact assertion fails', async () => {
  const pool = fakePool({ updateRowCount: 0 });
  await assert.rejects(applyCorrection({
    observationId: 12,
    operationKey: 'corr_2',
    operator: 'Kim',
    pool,
  }), /expected one canonical fact update/);
  assert.equal(pool.queries.at(-1).text, 'ROLLBACK');
  assert.equal(pool.queries.some(query => query.text === 'COMMIT'), false);
});
