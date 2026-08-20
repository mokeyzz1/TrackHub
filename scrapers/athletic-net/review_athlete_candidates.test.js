const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCandidateRecord,
  candidateSearchInput,
  attachExistingProfileMatches,
  groupRows,
  isUnattached,
} = require('./review_athlete_candidates');

test('treats unattached as affiliation state rather than school evidence', () => {
  assert.equal(isUnattached('Unattached'), true);
  assert.deepEqual(candidateSearchInput({ source_name: 'A Runner', source_team: 'unatt' }), {
    full_name: 'A Runner',
    school_name: '',
  });
});

test('groups repeated quarantined observations by source athlete identity', () => {
  const groups = groupRows([
    {
      observation_id: 1,
      source_record_id: 11,
      target_meet_id: 13130,
      raw_event_name: '100m',
      mark_raw: '10.40',
      place: 1,
      round: 'Finals',
      decision_reason: 'missing_athlete',
      payload: { source_athlete_key: 'live-7', athlete_name: 'A Runner', team_gender: 'M', team_name: 'Unattached' },
    },
    {
      observation_id: 2,
      source_record_id: 12,
      target_meet_id: 13130,
      raw_event_name: '200m',
      mark_raw: '21.20',
      place: 2,
      round: 'Finals',
      decision_reason: 'missing_athlete',
      payload: { source_athlete_key: 'live-7', athlete_name: 'A Runner', team_gender: 'M', team_name: 'Unattached' },
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].observations.length, 2);
  assert.equal(groups[0].source_athlete_key, 'live-7');
});

test('candidate reports remain review-only even when API returns a strong match', () => {
  const record = buildCandidateRecord(
    {
      source_athlete_key: 'live-7',
      source_name: 'A Runner',
      source_gender: 'M',
      source_team: 'Mount Union',
      observations: [],
    },
    { response: { docs: [{
      type: 'Athlete',
      id_db: 'anet-7',
      textsuggest: 'A Runner',
      subtext: 'Mount Union (Collegiate)||Alliance, OH',
    }] } }
  );

  assert.equal(record.decision, 'needs_review');
  assert.equal(record.recommended_candidate.athletic_net_profile_id, 'anet-7');
  assert.equal(record.recommended_candidate.confidence, 'high');
});

test('marks an exact existing Athletic.net profile as a review signal without auto-approving it', () => {
  const record = buildCandidateRecord(
    {
      source_athlete_key: 'live-8',
      source_name: 'B Runner',
      source_gender: 'M',
      source_team: 'Unattached',
      observations: [],
    },
    { response: { docs: [{
      type: 'Athlete',
      id_db: '30867585',
      textsuggest: 'B Runner',
      subtext: 'Case Western Reserve (Collegiate)||Cleveland, OH',
    }] } }
  );
  const [enriched] = attachExistingProfileMatches([record], [{
    athlete_id: 164350,
    full_name: 'B Runner',
    gender: 'M',
    tfrrs_athlete_id: '9360897',
    athletic_net_url: 'https://www.athletic.net/athlete/30867585/track-and-field',
    school_name: 'Case Western',
  }]);

  assert.equal(enriched.existing_profile_match_status, 'unique');
  assert.equal(enriched.existing_profile_matches[0].athlete_id, 164350);
  assert.equal(enriched.decision, 'needs_review');
});
