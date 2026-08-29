const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPlan,
  explicitNameVariantCompatible,
  normalizeName,
  schoolMatches,
} = require('./promote_athlete_aliases');

const decision = {
  source_athlete_key: '49173327',
  source_athlete_name: 'Bella Hodges',
  source_gender: 'F',
  target_tfrrs_athlete_id: '8222518',
  expected_school: 'Purdue Fort Wayne',
  match_method: 'verified_alias',
  evidence: ['https://example.test/source', 'https://example.test/reference'],
};

const target = {
  athlete_id: 45625,
  full_name: 'Bella Hodges',
  gender: 'F',
  tfrrs_athlete_id: '8222518',
  school_name: 'Purdue Fort Wayne',
};

test('normalizes names and recognizes school abbreviations by containment', () => {
  assert.equal(normalizeName('Jameson Marlatt, Jr.'), 'jameson marlatt');
  assert.equal(schoolMatches('Case Western', 'Case Western Reserve'), true);
});

test('builds an insert plan only for a unique matching target', () => {
  const [row] = buildPlan([decision], { targets: [target], aliases: [] });
  assert.equal(row.action, 'insert');
  assert.equal(row.reason, 'verified_target');
  assert.equal(row.target.athlete_id, 45625);
});

test('holds when the TFRRS target is missing or duplicated', () => {
  const [missing] = buildPlan([decision], { targets: [], aliases: [] });
  assert.equal(missing.action, 'hold');
  assert.equal(missing.reason, 'target_not_found');

  const [duplicate] = buildPlan([decision], { targets: [target, { ...target, athlete_id: 999 }], aliases: [] });
  assert.equal(duplicate.action, 'hold');
  assert.equal(duplicate.reason, 'target_tfrrs_id_not_unique');
});

test('holds conflicts instead of repointing an existing alias', () => {
  const [row] = buildPlan([decision], {
    targets: [target],
    aliases: [{ source: 'athletic_net', source_athlete_key: '49173327', target_athlete_id: 999, status: 'active' }],
  });
  assert.equal(row.action, 'hold');
  assert.equal(row.reason, 'existing_alias_conflict');
});

test('is idempotent when the existing alias already points at the verified target', () => {
  const [row] = buildPlan([decision], {
    targets: [target],
    aliases: [{ source: 'athletic_net', source_athlete_key: '49173327', target_athlete_id: 45625, status: 'active' }],
  });
  assert.equal(row.action, 'already_active');
});

test('allows only an explicit, audited first-name or middle-initial variant', () => {
  assert.equal(explicitNameVariantCompatible('Joseph Yadon', 'Joey Yadon'), true);
  assert.equal(explicitNameVariantCompatible('Gabby d. Domenici', 'Gabby Domenici'), true);
  assert.equal(explicitNameVariantCompatible('Joseph Yadon', 'Joseph Yadonn'), false);

  const [row] = buildPlan([{
    ...decision,
    source_athlete_name: 'Joseph Yadon',
    target_tfrrs_athlete_id: '9260873',
    expected_school: 'Dickinson St',
    allow_name_variant: true,
    name_variant_reason: 'Official TFRRS and Athletic.net identify the same Dickinson St athlete as Joey Yadon; source marks and placements match the canonical meet.',
    evidence: ['source', 'tfrrs', 'athletic_net'],
  }], {
    targets: [{ ...target, full_name: 'Joey Yadon', tfrrs_athlete_id: '9260873', school_name: 'Dickinson St' }],
    aliases: [],
  });
  assert.equal(row.action, 'insert');
});
