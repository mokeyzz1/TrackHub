const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadPublicSearchCandidates,
  parseProfileTeamKeys,
  parseSearchProfiles,
  surnameForSearch,
} = require('./promote_public_search_athlete_aliases');

test('uses the surname without a generational suffix for TFRRS search', () => {
  assert.equal(surnameForSearch('Antonio Alcantar III'), 'Alcantar');
  assert.equal(surnameForSearch('Adam Acuna'), 'Acuna');
});

test('parses bare and detailed TFRRS athlete search links without duplicates', () => {
  const html = `
    <table id="myTable"><tbody>
      <tr><td><a href="/athletes/9327863">Acuna, Adam</a></td></tr>
      <tr><td><a href="/athletes/9327863">Acuna, Adam</a></td></tr>
      <tr><td><a href="/athletes/9018581/San_Diego_Mesa/Ryan_Mann.html">Mann, Ryan</a></td></tr>
    </tbody></table>`;

  assert.deepEqual(parseSearchProfiles(html), [
    { id: '9327863', name: 'Acuna, Adam', profileUrl: 'https://www.tfrrs.org/athletes/9327863' },
    { id: '9018581', name: 'Ryan Mann', profileUrl: 'https://www.tfrrs.org/athletes/9018581/San_Diego_Mesa/Ryan_Mann.html' },
  ]);
});

test('requires the official profile page to link the exact source team', async () => {
  const formHtml = '<form><input name="authenticity_token" value="test-token"></form>';
  const searchHtml = `
    <table id="myTable"><tbody>
      <tr><td><a href="/athletes/9327863">Acuna, Adam</a></td></tr>
    </tbody></table>`;
  const profileHtml = '<a href="https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Bernardino_Valley.html">SAN BERNARDINO</a>';
  const http = {
    get: async url => {
      if (url === 'https://www.tfrrs.org/?do=search') {
        return { status: 200, data: formHtml, headers: { 'set-cookie': ['session=test; Path=/'] } };
      }
      return { status: 200, data: profileHtml, headers: {} };
    },
    post: async () => ({ status: 200, data: searchHtml, headers: {} }),
  };
  const rows = [{
    entity_type: 'individual_result',
    target_team_id: 8,
    target_school_id: 22,
    source_meet_key: 'tfrrs-42',
    tfrrs_team_url: 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Bernardino_Valley.html',
    payload: { team_gender: 'M', athlete_name: 'Adam Acuna' },
  }];

  const result = await loadPublicSearchCandidates(rows, {
    searchDelayMs: 0,
    profileDelayMs: 0,
    http,
  });

  const key = 'M|ca_jcollege_m_san_bernardino_valley|adam acuna';
  assert.equal(result.stats.exact_name_hits, 1);
  assert.equal(result.stats.team_verified_hits, 1);
  assert.equal(result.candidates.get(key).get('9327863').evidenceType,
    'tfrrs_public_profile_team_link');
  assert.deepEqual([...parseProfileTeamKeys(profileHtml)], ['ca_jcollege_m_san_bernardino_valley']);
});
