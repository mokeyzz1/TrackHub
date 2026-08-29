const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditOutcome,
  candidateClass,
  parseArgs,
  selectSupportedCandidates,
} = require('./run_4x100_recovery_batch');

test('4x100 recovery defaults to the populated Outdoor 2026 scope', () => {
  assert.deepEqual(parseArgs([]), {
    season: 'Outdoor 2026',
    from: '2025-08-01',
    to: '2026-07-31',
    source: 'auto',
    classification: 'all',
    meetId: null,
    limit: 1,
    concurrency: 2,
    delayMs: 1500,
    timeoutMs: 900000,
    retryConfirmed: false,
    listOnly: false,
  });
});

test('4x100 recovery supports a read-only candidate listing', () => {
  assert.equal(parseArgs(['--list-only']).listOnly, true);
});

test('4x100 recovery rejects public commit mode', () => {
  assert.throws(() => parseArgs(['--commit']), /dry-run only/);
});

test('candidate classification distinguishes the three database signatures', () => {
  assert.equal(candidateClass({ four_by_one_rows: 0, four_by_one_status_rows: 0 }), 'missing');
  assert.equal(candidateClass({ four_by_one_rows: 4, four_by_one_status_rows: 4 }), 'status_only');
  assert.equal(candidateClass({ four_by_one_rows: 4, four_by_one_status_rows: 2 }), 'malformed');
});

test('source selection stays relay-only and prefers TFRRS', () => {
  const result = selectSupportedCandidates([{
    meet_id: 12226,
    needs_individual: false,
    needs_relays: true,
    source_candidates: {
      tfrrs_url: 'https://www.tfrrs.org/results/95329',
      athletic_net_results_url: 'https://www.athletic.net/TrackAndField/meet/1/results',
    },
  }], { source: 'auto', limit: 1 });
  assert.equal(result.selected.length, 1);
  assert.deepEqual(result.selected[0].selection, {
    source: 'tfrrs',
    url: 'https://www.tfrrs.org/results/95329',
    relaysOnly: true,
  });
});

test('source audit requires numeric canonical 4x100 relay parents for confirmation', () => {
  assert.equal(auditOutcome({ numeric_parent_rows: 12 }), 'source_confirmed');
  assert.equal(auditOutcome({
    numeric_parent_rows: 12,
    source_comparison_teams: 12,
    existing_comparison_teams: 12,
    comparison_team_overlap: 0,
  }), 'source_identity_conflict');
  assert.equal(auditOutcome({ numeric_parent_rows: 0, unmapped_parent_rows: 2 }), 'source_event_unmapped');
  assert.equal(auditOutcome({ numeric_parent_rows: 0, parent_rows: 3 }), 'source_4x100_without_numeric_marks');
  assert.equal(auditOutcome({ numeric_parent_rows: 0, parent_rows: 0 }), 'source_has_no_4x100_observations');
});
