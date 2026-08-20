const test = require('node:test');
const assert = require('node:assert/strict');

const {
  connectionString,
  parseArgs,
  scopeMeetIds,
  validateReview,
} = require('./promote_ingest_run');

test('promotion requires an explicit run and commit flag', () => {
  assert.throws(() => parseArgs([]), /--run-id is required/);
  assert.throws(() => parseArgs(['--run-id', 'abc']), /pass --commit/);
  assert.deepEqual(parseArgs(['--run-id', 'abc', '--commit']), {
    runId: 'abc',
    allowQuarantines: false,
    allowMultiMeet: false,
  });
});

test('promotion extracts one or more meet IDs from importer scopes', () => {
  assert.deepEqual(scopeMeetIds({ meet_id: 13051 }), [13051]);
  assert.deepEqual(scopeMeetIds({ meet_ids: [13051, '13051', 13052] }), [13051, 13052]);
});

test('promotion accepts only a successful single-meet dry run by default', () => {
  const review = {
    run: { mode: 'dry_run', status: 'succeeded', source: 'tfrrs', scope: { meet_ids: [13051] } },
    decisions: { pending: 230 },
  };
  assert.deepEqual(validateReview(review, { allowQuarantines: false, allowMultiMeet: false }), { meetIds: [13051] });
  assert.throws(
    () => validateReview({ ...review, run: { ...review.run, status: 'failed' } }, { allowQuarantines: false, allowMultiMeet: false }),
    /succeeded dry_run/
  );
});

test('promotion rejects quarantines unless explicitly allowed', () => {
  const review = {
    run: { mode: 'dry_run', status: 'succeeded', source: 'athletic_net', scope: { meet_id: 1 } },
    decisions: { pending: 4, quarantine: 1 },
  };
  assert.throws(() => validateReview(review, { allowQuarantines: false, allowMultiMeet: false }), /quarantined observations/);
  assert.deepEqual(validateReview(review, { allowQuarantines: true, allowMultiMeet: false }), { meetIds: [1] });
});

test('controlled promotion requires the private database URL', () => {
  assert.equal(connectionString({ DATABASE_URL: 'postgresql://local' }), null);
});
