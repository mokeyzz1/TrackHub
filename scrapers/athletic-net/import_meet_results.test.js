const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveIndividualTeam } = require('./import_meet_results');

test('resolves an individual team only with athlete-school and team-name corroboration', () => {
  const teams = new Map([
    ['483|M', { teamId: 953, schoolName: 'Grand Valley State Grand Valley St.' }]
  ]);

  assert.equal(resolveIndividualTeam({
    schoolId: 483,
    scrapedTeam: 'Grand Valley State',
    gender: 'M'
  }, teams), 953);

  assert.equal(resolveIndividualTeam({
    schoolId: 483,
    scrapedTeam: 'Saginaw Valley',
    gender: 'M'
  }, teams), null);
});
