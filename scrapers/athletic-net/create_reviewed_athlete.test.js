const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPlan, normalizeName } = require('./create_reviewed_athlete');

const decision = {
  source_athlete_key: '49173398',
  source_athlete_name: 'Ryan McVicker',
  source_gender: 'M',
  target_tfrrs_athlete_id: '8371168',
  expected_school: 'Mount Union',
  athletic_net_profile_id: '21785574',
  evidence: ['https://example.test/source', 'https://example.test/reference'],
};

const school = { school_id: 1391, official_name: 'University of Mount Union', short_name: 'Mount Union' };

test('normalizes reviewed names before duplicate checks', () => {
  assert.equal(normalizeName('Ryan McVicker'), 'ryan mcvicker');
});

test('plans a new athlete only when external and same-name guards are clear', () => {
  const [row] = buildPlan([decision], {
    schools: [school],
    byTfrrs: [],
    byNameSchool: [],
    aliases: [],
  });
  assert.equal(row.action, 'create_and_alias');
  assert.equal(row.athlete.school_id, 1391);
  assert.equal(row.athlete.tfrrs_athlete_id, '8371168');
});

test('holds an existing same-name/same-school row instead of duplicating it', () => {
  const [row] = buildPlan([decision], {
    schools: [school],
    byTfrrs: [],
    byNameSchool: [{ athlete_id: 10, full_name: 'Ryan McVicker', gender: 'M', school_id: 1391 }],
    aliases: [],
  });
  assert.equal(row.action, 'hold');
  assert.equal(row.reason, 'same_name_school_exists');
});

test('holds an existing TFRRS identity rather than repointing it', () => {
  const [row] = buildPlan([decision], {
    schools: [school],
    byTfrrs: [{ athlete_id: 11, full_name: 'Other Runner', gender: 'M', school_id: 1391, tfrrs_athlete_id: '8371168' }],
    byNameSchool: [],
    aliases: [],
  });
  assert.equal(row.action, 'hold');
  assert.equal(row.reason, 'target_tfrrs_already_exists');
});
