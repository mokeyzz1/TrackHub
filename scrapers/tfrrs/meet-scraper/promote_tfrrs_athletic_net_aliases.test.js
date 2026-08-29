const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPlan,
  schoolMatches,
  strictApiCandidate,
} = require('./promote_tfrrs_athletic_net_aliases');

const identity = {
  sourceAthleteKey: 'tfrrs:meet=tfrrs-42|team=8|gender=M|name=ryan mann',
  sourceAthleteName: 'Ryan Mann',
  sourceGender: 'M',
  sourceMeetKey: 'tfrrs-42',
  targetTeamId: 8,
  targetSchoolId: 22,
};

test('school comparison accepts collegiate API suffixes', () => {
  assert.equal(
    schoolMatches('San Diego Mesa', 'San Diego Mesa (Collegiate)||San Diego, CA'),
    true
  );
  assert.equal(
    schoolMatches('San Diego Mesa', 'Bakersfield (Collegiate)||Bakersfield, CA'),
    false
  );
});

test('API candidate requires one exact name and school match', () => {
  const result = strictApiCandidate({
    response: { docs: [
      {
        type: 'Athlete',
        id_db: '9018581',
        textsuggest: 'Ryan Mann',
        subtext: 'San Diego Mesa (Collegiate)||San Diego, CA',
      },
      {
        type: 'Athlete',
        id_db: '9999999',
        textsuggest: 'Ryan Mann',
        subtext: 'San Diego Mesa (Collegiate)||San Diego, CA',
      },
    ] },
  }, { sourceAthleteName: 'Ryan Mann', sourceSchoolName: 'San Diego Mesa' });
  assert.equal(result.candidate, null);
  assert.equal(result.reason, 'ambiguous_exact_api_candidates');
});

test('cross-source plan inserts only a unique existing profile owner', () => {
  const candidateRows = [{
    sourceAthleteKey: identity.sourceAthleteKey,
    candidate: {
      id: '9018581',
      matched_name: 'Ryan Mann',
      matched_school: 'San Diego Mesa (Collegiate)||San Diego, CA',
      name_exact: true,
      school_match: true,
      confidence: 'high',
    },
    candidate_count: 1,
  }];
  const targets = [{
    athlete_id: 7,
    full_name: 'Ryan Mann',
    gender: 'M',
    school_id: 1835,
    athletic_net_url: 'https://www.athletic.net/athlete/9018581/track-and-field',
  }];

  const [safe] = buildPlan(
    new Map([[identity.sourceAthleteKey, identity]]),
    candidateRows,
    targets,
    []
  );
  assert.equal(safe.action, 'insert');
  assert.equal(safe.reason, 'verified_cross_source_profile');
  assert.equal(safe.target.athlete_id, 7);

  const [held] = buildPlan(
    new Map([[identity.sourceAthleteKey, identity]]),
    candidateRows,
    [{ ...targets[0], gender: 'F' }],
    []
  );
  assert.equal(held.action, 'hold');
  assert.equal(held.reason, 'target_gender_mismatch');
});
