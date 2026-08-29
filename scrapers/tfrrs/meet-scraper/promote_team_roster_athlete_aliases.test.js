const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCrossSeasonCandidates,
  buildRosterCandidates,
  parseProfileTitleName,
  parseTeamRosterProfiles,
} = require('./promote_team_roster_athlete_aliases');

test('parses linked athlete profiles from an official TFRRS team roster', () => {
  const profiles = parseTeamRosterProfiles(`
    <table><tr>
      <td><a href="/athletes/9327863/San_Bernardino_Valley/Adam_Acuna.html">Acuna, Adam</a></td>
      <td><a href="/athletes/9327863/San_Bernardino_Valley/Adam_Acuna.html">Acuna, Adam</a></td>
    </tr></table>`);

  assert.deepEqual(profiles, [{
    id: '9327863',
    name: 'Adam Acuna',
    profileUrl: 'https://www.tfrrs.org/athletes/9327863/San_Bernardino_Valley/Adam_Acuna.html',
  }]);
});

test('only creates a candidate when the roster belongs to the exact source team', () => {
  const row = {
    entity_type: 'individual_result',
    target_team_id: 8,
    target_school_id: 22,
    source_meet_key: 'tfrrs-42',
    tfrrs_team_url: 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Bernardino_Valley.html',
    payload: { team_gender: 'M', athlete_name: 'Adam Acuna' },
  };
  const profile = {
    id: '9327863',
    name: 'Adam Acuna',
    profileUrl: 'https://www.tfrrs.org/athletes/9327863/San_Bernardino_Valley/Adam_Acuna.html',
  };
  const key = 'ca_jcollege_m_san_bernardino_valley';
  const result = buildRosterCandidates([row], new Map([[key, {
    teamKey: key,
    url: `https://www.tfrrs.org/teams/tf/${key}.html`,
    profiles: [profile],
  }]]));

  assert.equal(result.stats.exact_name_hits, 1);
  assert.equal(result.stats.verified_hits, 1);
  assert.equal(result.candidates.get('M|ca_jcollege_m_san_bernardino_valley|adam acuna').get('9327863').evidenceType,
    'tfrrs_team_roster_profile_link');
});

test('accepts a unique legacy TFRRS ID only when its official profile confirms the current team', () => {
  const row = {
    entity_type: 'individual_result',
    target_team_id: 8,
    target_school_id: 22,
    source_meet_key: 'tfrrs-42',
    tfrrs_team_url: 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Bernardino_Valley.html',
    payload: { team_gender: 'M', athlete_name: 'Adam Acuna' },
  };
  const rosterCandidates = new Map([[
    'M|ca_jcollege_m_san_bernardino_valley|adam acuna',
    new Map([['9327863', {
      id: '9327863',
      name: 'Adam Acuna',
      profileUrl: 'https://www.tfrrs.org/athletes/9327863/San_Bernardino_Valley/Adam_Acuna.html',
    }]]),
  ]]);
  const result = buildCrossSeasonCandidates(
    [row],
    rosterCandidates,
    [{
      athlete_id: 77,
      full_name: 'Adam Acuna',
      gender: null,
      tfrrs_athlete_id: '9000001',
      school_id: 1835,
    }],
    new Map([['9000001', {
      id: '9000001',
      name: 'Adam Acuna',
      profileUrl: 'https://www.tfrrs.org/athletes/9000001',
      teamKeys: new Set(['ca_jcollege_m_san_bernardino_valley']),
    }]])
  );

  const profile = result.candidates
    .get('M|ca_jcollege_m_san_bernardino_valley|adam acuna')
    .get('9000001');
  assert.equal(profile.evidenceType, 'tfrrs_cross_season_profile_pair');
  assert.equal(result.stats.legacy_team_verified_hits, 1);
});

test('does not accept a legacy profile from a different team', () => {
  const row = {
    entity_type: 'individual_result',
    target_team_id: 8,
    target_school_id: 22,
    source_meet_key: 'tfrrs-42',
    tfrrs_team_url: 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Bernardino_Valley.html',
    payload: { team_gender: 'M', athlete_name: 'Adam Acuna' },
  };
  const rosterCandidates = new Map([[
    'M|ca_jcollege_m_san_bernardino_valley|adam acuna',
    new Map([['9327863', { id: '9327863', name: 'Adam Acuna', profileUrl: 'current' }]]),
  ]]);
  const result = buildCrossSeasonCandidates(
    [row],
    rosterCandidates,
    [{ athlete_id: 77, full_name: 'Adam Acuna', gender: null, tfrrs_athlete_id: '9000001', school_id: 1835 }],
    new Map([['9000001', {
      id: '9000001',
      name: 'Adam Acuna',
      profileUrl: 'legacy',
      teamKeys: new Set(['ca_jcollege_m_wrong_team']),
    }]])
  );

  assert.equal(result.candidates.size, 0);
  assert.equal(result.stats.legacy_team_mismatch_hits, 1);
});

test('accepts a unique existing TFRRS identity even when the current roster omits the athlete', () => {
  const row = {
    entity_type: 'individual_result',
    target_team_id: 8,
    target_school_id: 22,
    source_meet_key: 'tfrrs-42',
    tfrrs_team_url: 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Bernardino_Valley.html',
    payload: { team_gender: 'M', athlete_name: 'Adam Acuna' },
  };
  const result = buildCrossSeasonCandidates(
    [row],
    new Map(),
    [{ athlete_id: 77, full_name: 'Adam Acuna', gender: null, tfrrs_athlete_id: '9000001', school_id: 1835 }],
    new Map([['9000001', {
      id: '9000001',
      name: 'Adam Acuna',
      profileUrl: 'legacy',
      teamKeys: new Set(['ca_jcollege_m_san_bernardino_valley']),
    }]])
  );

  const profile = result.candidates
    .get('M|ca_jcollege_m_san_bernardino_valley|adam acuna')
    .get('9000001');
  assert.equal(profile.evidenceType, 'tfrrs_legacy_profile_team_match');
  assert.equal(profile.currentProfileUrl, null);
});

test('extracts the exact athlete name from a TFRRS profile title', () => {
  assert.equal(parseProfileTitleName('<title>TFRRS | Aaron McCarthy – Track and Field Results & Statistics</title>'), 'Aaron McCarthy');
});
