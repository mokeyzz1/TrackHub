/**
 * Candidate generation for legacy school-discovery scripts.
 *
 * A normalized name can block an insert or route it to review. It can never prove that a school
 * is new: punctuation variants can be duplicates, while different institutions can share a
 * normalized name.
 */

function normalizeSchoolCandidateName(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function buildExistingSchoolIndex(schools) {
  const index = new Map();
  for (const school of schools || []) {
    const names = new Set([
      normalizeSchoolCandidateName(school.official_name),
      normalizeSchoolCandidateName(school.short_name)
    ]);
    names.delete('');
    for (const name of names) {
      const matches = index.get(name) || [];
      matches.push(school);
      index.set(name, matches);
    }
  }
  return index;
}

function classifySchoolCandidate(candidate, existingIndex) {
  const normalizedName = normalizeSchoolCandidateName(candidate?.school_name);
  const existingMatches = normalizedName ? (existingIndex.get(normalizedName) || []) : [];

  if (!normalizedName) {
    return { status: 'blocked_missing_name', normalizedName, existingMatches };
  }
  if (existingMatches.length > 0) {
    return { status: 'blocked_existing_candidate', normalizedName, existingMatches };
  }
  if (!candidate?.team_state || !candidate?.team_slug) {
    return { status: 'blocked_insufficient_identity', normalizedName, existingMatches };
  }
  return { status: 'requires_curated_review', normalizedName, existingMatches };
}

function assertLegacySchoolCreationDisabled(commit) {
  if (!commit) return;
  throw new Error(
    'Automatic school creation is disabled. Produce a reviewed identity mapping and a guarded migration instead.'
  );
}

module.exports = {
  normalizeSchoolCandidateName,
  buildExistingSchoolIndex,
  classifySchoolCandidate,
  assertLegacySchoolCreationDisabled
};
