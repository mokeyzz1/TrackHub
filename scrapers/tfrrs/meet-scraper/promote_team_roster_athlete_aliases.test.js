const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRosterCandidates,
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
