const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRosterObservation,
  buildRosterPlan,
  seasonInterval,
} = require('./collegiate_roster_evidence');

function row(overrides = {}) {
  return {
    tfrrs_athlete_id: '9020036',
    full_name: 'Example Runner',
    school_id: 12,
    gender: 'F',
    class_year: 'SO',
    tfrrs_team_url: 'https://www.tfrrs.org/teams/tf/TX_college_f_Example.html?config=1',
    season: '2026 Indoor',
    ...overrides,
  };
}

function context(observation, overrides = {}) {
  return {
    athletesByTfrrsId: new Map([[observation.tfrrs_athlete_id, [{ athlete_id: 41, gender: 'F' }]]]),
    teamsBySchoolGender: new Map([[`${observation.school_id}|${observation.gender}`, [{
      team_id: 22,
      school_id: observation.school_id,
      gender: observation.gender,
      institution_type: 'collegiate',
    }]]]),
    membershipsBySchool: new Map([[observation.school_id, [{
      valid_from: null,
      valid_to: null,
      membership_status: 'active',
      verification_status: 'legacy_mapped',
    }]]]),
    evidenceBySourceKey: new Map(),
    ...overrides,
  };
}

test('maps an indoor or outdoor competition year to one academic season interval', () => {
  assert.deepEqual(seasonInterval('2026 Indoor'), {
    seasonCode: '2025-2026', effectiveFrom: '2025-07-01', effectiveTo: '2026-07-01',
  });
  assert.deepEqual(seasonInterval('2025-2026'), {
    seasonCode: '2025-2026', effectiveFrom: '2025-07-01', effectiveTo: '2026-07-01',
  });
  assert.throws(() => seasonInterval('2025-2027'), /consecutive/);
});

test('builds a provider-qualified deterministic roster observation', () => {
  const first = buildRosterObservation(row());
  const second = buildRosterObservation(row({ scraped_at: '2026-02-10T12:00:00Z' }));
  assert.equal(first.source, 'tfrrs');
  assert.equal(first.source_record_key, second.source_record_key);
  assert.equal(first.source_snapshot_hash, second.source_snapshot_hash);
  assert.equal(first.source_url.includes('?'), false);
  assert.equal(first.effective_to, '2026-07-01');
});

test('keeps TFRRS identity provider-specific and rejects malformed IDs and team URLs', () => {
  assert.throws(() => buildRosterObservation(row({ tfrrs_athlete_id: 'athletic-net:9020036' })), /digits/);
  assert.throws(() => buildRosterObservation(row({ tfrrs_team_url: 'https://www.athletic.net/team/12' })), /tfrrs/);
});

test('accepts one exact collegiate identity and team mapping', () => {
  const observation = buildRosterObservation(row());
  const plan = buildRosterPlan([observation], context(observation));
  assert.equal(plan.ready.length, 1);
  assert.equal(plan.held.length, 0);
  assert.equal(plan.ready[0].athlete.athlete_id, 41);
  assert.equal(plan.ready[0].team.team_id, 22);
});

test('holds missing or ambiguous canonical athlete identities instead of name matching', () => {
  const observation = buildRosterObservation(row());
  const missing = buildRosterPlan([observation], context(observation, { athletesByTfrrsId: new Map() }));
  const ambiguous = buildRosterPlan([observation], context(observation, {
    athletesByTfrrsId: new Map([[observation.tfrrs_athlete_id, [{ athlete_id: 1 }, { athlete_id: 2 }]]]),
  }));
  assert.equal(missing.held[0].reason, 'canonical_athlete_missing');
  assert.equal(ambiguous.held[0].reason, 'ambiguous_tfrrs_athlete_id');
});

test('holds clubs and schools without season-covering collegiate membership', () => {
  const observation = buildRosterObservation(row());
  const clubContext = context(observation);
  clubContext.teamsBySchoolGender.get('12|F')[0].institution_type = 'club';
  assert.equal(buildRosterPlan([observation], clubContext).held[0].reason, 'school_not_collegiate');

  const noMembership = context(observation, { membershipsBySchool: new Map() });
  assert.equal(buildRosterPlan([observation], noMembership).held[0].reason, 'collegiate_membership_not_verified_for_season');
});

test('classifies an identical stored observation as replay and holds changed source payload', () => {
  const observation = buildRosterObservation(row());
  const exact = context(observation, { evidenceBySourceKey: new Map([[observation.source_record_key, [{
    athlete_id: 41, source_snapshot_hash: observation.source_snapshot_hash,
  }]]]) });
  assert.equal(buildRosterPlan([observation], exact).replayed[0].reason, 'exact_replay');

  const changed = context(observation, { evidenceBySourceKey: new Map([[observation.source_record_key, [{
    athlete_id: 41, source_snapshot_hash: 'different',
  }]]]) });
  assert.equal(buildRosterPlan([observation], changed).held[0].reason, 'source_payload_changed');
});

test('holds contradictory duplicate source rows instead of letting input order win', () => {
  const first = buildRosterObservation(row());
  const second = buildRosterObservation(row({ full_name: 'Changed Name' }));
  const plan = buildRosterPlan([first, second], context(first));
  assert.equal(plan.ready.length, 0);
  assert.equal(plan.held[0].reason, 'conflicting_rows_for_source_key');
});
