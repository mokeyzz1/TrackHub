const test = require('node:test');
const assert = require('node:assert/strict');

const { parseTfrrsTeamInfo } = require('./tfrrs_team_identity');

test('parses four-year TFRRS team links', () => {
  assert.deepEqual(parseTfrrsTeamInfo('/teams/tf/MA_college_m_Springfield.html'), {
    state: 'MA', gender: 'M', teamSlug: 'Springfield'
  });
});

test('parses junior-college TFRRS team links and preserves gender', () => {
  assert.deepEqual(parseTfrrsTeamInfo('/teams/tf/CA_jcollege_f_Mt_SAC.html'), {
    state: 'CA', gender: 'F', teamSlug: 'Mt_SAC'
  });
});
