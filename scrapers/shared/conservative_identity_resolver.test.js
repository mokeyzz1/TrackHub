const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ExactAthleteResolver,
  ExactTeamResolver,
  normalizeCanonicalTeamName,
  normalizeIdentityName
} = require('./conservative_identity_resolver');

test('identity normalization is punctuation and accent tolerant', () => {
  assert.equal(normalizeIdentityName("José O'Neil"), 'jose o neil');
  assert.equal(normalizeCanonicalTeamName('Example College - A'), 'example college');
});

test('exact team resolver requires a unique canonical school/gender match', () => {
  const resolver = new ExactTeamResolver([
    { team_id: 11, school_id: 101, gender: 'F', official_name: 'Example College', short_name: 'Example' },
    { team_id: 12, school_id: 101, gender: 'M', official_name: 'Example College', short_name: 'Example' },
    { team_id: 13, school_id: 102, gender: 'F', official_name: 'Example College', short_name: 'Example' },
  ]);
  assert.equal(resolver.resolve({ sourceTeamName: 'Example College', sourceGender: 'M' }).team_id, 12);
  assert.equal(resolver.resolve({ sourceTeamName: 'Example College', sourceGender: 'F' }), null);
});

test('exact team resolver can resolve a reviewed non-collegiate team without a school', () => {
  const resolver = new ExactTeamResolver([
    {
      team_id: 44,
      school_id: null,
      team_name: 'Dawgs Track Club',
      team_type: 'club',
      gender: 'M',
      official_name: null,
      short_name: null,
    },
  ]);
  assert.deepEqual(
    resolver.resolve({ sourceTeamName: 'Dawgs Track Club', sourceGender: 'M' }),
    {
      team_id: 44,
      school_id: null,
      team_name: 'Dawgs Track Club',
      team_type: 'club',
      match_field: 'exact_canonical_team_name',
      match_method: 'exact_canonical_name',
    },
  );
});

test('exact athlete resolver uses team school corroboration and rejects ambiguity', () => {
  const teams = new ExactTeamResolver([
    { team_id: 11, school_id: 101, gender: 'F', official_name: 'Example College', short_name: 'Example' },
  ]);
  const resolver = new ExactAthleteResolver([
    { athlete_id: 21, school_id: 101, gender: 'F', full_name: 'Runner One' },
    { athlete_id: 22, school_id: 102, gender: 'F', full_name: 'Runner One' },
    { athlete_id: 23, school_id: 101, gender: 'F', full_name: 'Unique Runner' },
  ], teams);
  assert.equal(resolver.resolve({
    sourceAthleteName: 'Runner One', sourceGender: 'F', sourceTeamName: 'Example College'
  }).athlete_id, 21);
  assert.equal(resolver.resolve({
    sourceAthleteName: 'Runner One', sourceGender: 'F', sourceTeamName: 'Unknown College'
  }), null);
  assert.equal(resolver.resolve({
    sourceAthleteName: 'Unique Runner', sourceGender: 'F', sourceTeamName: 'Unknown College'
  }).athlete_id, 23);
});

test('exact athlete resolver uses unique participation in the exact meet to resolve duplicate rows', () => {
  const teams = new ExactTeamResolver([
    { team_id: 11, school_id: 101, gender: 'M', official_name: 'Example College', short_name: 'Example' },
  ]);
  const resolver = new ExactAthleteResolver([
    { athlete_id: 21, school_id: 101, gender: 'M', full_name: 'Runner One' },
    { athlete_id: 22, school_id: 101, gender: 'M', full_name: 'Runner One' },
  ], teams, new Map([
    [21, new Set([900])],
    [22, new Set()],
  ]));

  const resolved = resolver.resolve({
    sourceAthleteName: 'Runner One',
    sourceGender: 'M',
    sourceTeamName: 'Example College',
    sourceMeetId: 900,
  });
  assert.equal(resolved.athlete_id, 21);
  assert.equal(resolved.match_field, 'exact_name_gender_school_meet_participation');
});

test('exact athlete resolver keeps duplicate rows held when multiple candidates participated', () => {
  const teams = new ExactTeamResolver([
    { team_id: 11, school_id: 101, gender: 'M', official_name: 'Example College', short_name: 'Example' },
  ]);
  const resolver = new ExactAthleteResolver([
    { athlete_id: 21, school_id: 101, gender: 'M', full_name: 'Runner One' },
    { athlete_id: 22, school_id: 101, gender: 'M', full_name: 'Runner One' },
  ], teams, new Map([
    [21, new Set([900])],
    [22, new Set([900])],
  ]));

  assert.equal(resolver.resolve({
    sourceAthleteName: 'Runner One',
    sourceGender: 'M',
    sourceTeamName: 'Example College',
    sourceMeetId: 900,
  }), null);
});

test('exact athlete resolver uses exact canonical team participation across a school-entity mismatch', () => {
  const teams = new ExactTeamResolver([
    { team_id: 11, school_id: 101, gender: 'M', official_name: 'Example College', short_name: 'Example' },
  ]);
  const resolver = new ExactAthleteResolver([
    { athlete_id: 21, school_id: 202, gender: 'M', full_name: 'Runner One' },
  ], teams, new Map(), new Map([
    [21, new Set([11])],
  ]));

  const resolved = resolver.resolve({
    sourceAthleteName: 'Runner One',
    sourceGender: 'M',
    sourceTeamName: 'Example College',
    sourceTeamId: 11,
  });
  assert.equal(resolved.athlete_id, 21);
  assert.equal(resolved.match_field, 'exact_name_gender_team_participation');
});
