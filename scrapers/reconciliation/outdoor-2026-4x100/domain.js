const crypto = require('crypto');
const { isStatusCode, normalizeRound } = require('../../shared/ingestion_contract');
const { parseMarkSeconds } = require('../../shared/mark_parser');
const { normaliseMarkKey } = require('../../shared/result_fingerprint');
const { normalizeTeamAlias, genderKey } = require('../../shared/team_alias_resolver');
const { parseTfrrsTeamInfo } = require('../../shared/tfrrs_team_identity');

const EVENT_CODE = '4x100m';
const SOURCE = 'tfrrs';

function text(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).normalize('NFKC').trim();
  return normalized || null;
}

function normalizeMeetName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(?:combined events?|multis?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyMeet(meet = {}) {
  const name = String(meet.name || '');
  const hasCombinedWords = /\bcombined events?\b|\bmultis?\b/i.test(name);
  const bracketedCombined = /\[(?:combined events?|multis?)\]/i.test(name);
  const championshipCombined = /\bchampionships?\b/i.test(name) && hasCombinedWords;

  if (bracketedCombined || championshipCombined) {
    return {
      kind: 'combined_child_candidate',
      base_name: normalizeMeetName(name),
      reason: bracketedCombined ? 'bracketed_combined_events' : 'championship_combined_events',
      expects_4x100: false,
    };
  }

  if (hasCombinedWords) {
    return {
      kind: 'multi_only',
      base_name: normalizeMeetName(name),
      reason: 'standalone_multi_event_meet',
      expects_4x100: false,
    };
  }

  if (/\bprelims?|preliminar(?:y|ies)\b/i.test(name)) {
    return {
      kind: 'preliminary',
      base_name: normalizeMeetName(name),
      reason: 'preliminary_meet_record',
      expects_4x100: true,
    };
  }

  return {
    kind: 'canonical',
    base_name: normalizeMeetName(name),
    reason: 'regular_meet_record',
    expects_4x100: true,
  };
}

function addToSetMap(map, key, value) {
  if (!key || !value) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(Number(value));
}

function uniqueValue(map, key) {
  const values = map.get(key);
  return values?.size === 1 ? [...values][0] : null;
}

class TeamCatalog {
  constructor({ teams = [], aliasResolver = null } = {}) {
    this.aliasResolver = aliasResolver;
    this.byId = new Map();
    this.byName = new Map();
    this.bySourceKey = new Map();

    for (const row of teams) {
      const teamId = Number(row.team_id);
      const gender = genderKey(row.gender);
      if (!teamId || !gender) continue;
      this.byId.set(teamId, row);

      for (const name of [row.official_name, row.short_name]) {
        const normalized = normalizeTeamAlias(name);
        if (normalized) addToSetMap(this.byName, `${normalized}|${gender}`, teamId);
      }

      const sourceInfo = parseTfrrsTeamInfo(row.tfrrs_team_url);
      if (sourceInfo) {
        addToSetMap(this.bySourceKey,
          `${sourceInfo.state}|${sourceInfo.teamSlug}|${sourceInfo.gender}`, teamId);
        addToSetMap(this.bySourceKey, `${sourceInfo.teamSlug}|${sourceInfo.gender}`, teamId);
      }
    }
  }

  resolve(sourceFact = {}) {
    const gender = genderKey(sourceFact.gender);
    if (!gender) return null;

    const alias = this.aliasResolver?.resolve({
      source: SOURCE,
      sourceTeamKey: sourceFact.source_team_key,
      sourceTeamName: sourceFact.team_name,
      sourceGender: gender,
    });
    if (alias?.team_id) return { ...alias, method: 'reviewed_alias' };

    const sourceKey = text(sourceFact.source_team_key);
    if (sourceKey) {
      const stateKey = text(sourceFact.source_team_state)?.toUpperCase();
      const keys = stateKey
        ? [`${stateKey}|${sourceKey}|${gender}`, `${sourceKey}|${gender}`]
        : [`${sourceKey}|${gender}`];
      for (const key of keys) {
        const teamId = uniqueValue(this.bySourceKey, key);
        if (teamId) return { team_id: teamId, method: 'exact_tfrrs_team_key' };
      }
    }

    const normalizedName = normalizeTeamAlias(sourceFact.team_name);
    if (!normalizedName) return null;
    const exact = uniqueValue(this.byName, `${normalizedName}|${gender}`);
    if (exact) return { team_id: exact, method: 'exact_canonical_name' };

    const prefixCandidates = new Set();
    for (const [key, teamIds] of this.byName.entries()) {
      const separator = key.lastIndexOf('|');
      if (separator < 1 || key.slice(separator + 1) !== gender) continue;
      const candidateName = key.slice(0, separator);
      if (!candidateName.startsWith(`${normalizedName} `)) continue;
      for (const teamId of teamIds) prefixCandidates.add(teamId);
    }
    if (prefixCandidates.size === 1) {
      return { team_id: [...prefixCandidates][0], method: 'unique_canonical_prefix' };
    }
    return null;
  }
}

function normalizedLineup(legs = []) {
  return legs
    .slice()
    .sort((left, right) => Number(left.leg_order || 0) - Number(right.leg_order || 0))
    .map(leg => normalizeTeamAlias(leg.athlete_name || leg.name) || String(leg.athlete_id || ''))
    .filter(Boolean);
}

function sourceRecordKey(row, ordinal) {
  const lineup = normalizedLineup(row.relay_athletes);
  // TFRRS normally provides a team, place, or lineup that is stable across re-fetches. Use a
  // presentation-order fallback only for indistinguishable status rows with none of those fields.
  const ordinalFallback = !lineup.length && row.place == null ? ordinal : '';
  const digest = crypto.createHash('sha256').update([
    SOURCE,
    row.source_meet_key,
    row.source_event_key,
    row.gender,
    row.source_team_key || row.team_name,
    normaliseMarkKey(row.mark_raw),
    row.place ?? '',
    normalizeRound(row.round).raw || '',
    lineup.join('|'),
    ordinalFallback,
  ].join('\u001f')).digest('hex');
  return `tfrrs:4x100:${digest}`;
}

function normalizeSourceFact(row = {}, ordinal = 0, teamCatalog = null) {
  const markRaw = text(row.mark_raw);
  const gender = genderKey(row.team_gender || row.gender);
  const fact = {
    source: SOURCE,
    source_meet_key: text(row.source_meet_key),
    source_event_key: text(row.event_id || row.source_event_key || row.event_url || row.source_url),
    source_url: text(row.source_url || row.event_url),
    gender,
    team_name: text(row.school_name || row.team_name),
    source_team_key: text(row.source_team_key),
    source_team_state: text(row.source_team_state),
    team_id: null,
    team_resolution_method: null,
    mark_raw: markRaw,
    mark_seconds: row.mark_seconds ?? parseMarkSeconds(markRaw),
    status_code: isStatusCode(markRaw) ? markRaw.toUpperCase() : null,
    place: Number.isInteger(Number(row.place)) && Number(row.place) > 0 ? Number(row.place) : null,
    round: normalizeRound(row.round).canonical,
    round_raw: text(row.round),
    relay_athletes: (row.relay_athletes || []).map((leg, index) => ({
      athlete_id: leg.athlete_id || leg.tfrrs_athlete_id || null,
      athlete_name: leg.athlete_name || leg.name || null,
      leg_order: leg.leg_order || index + 1,
    })),
  };
  const resolution = teamCatalog?.resolve(fact) || null;
  fact.team_id = resolution?.team_id || null;
  fact.team_resolution_method = resolution?.method || null;
  fact.source_record_key = sourceRecordKey(fact, ordinal);
  return fact;
}

function normalizeLocalFact(row = {}) {
  const markRaw = text(row.mark_raw);
  const validTeam = Boolean(row.team_id && row.canonical_team_id && row.school_id && row.canonical_school_id);
  return {
    relay_result_id: Number(row.relay_result_id),
    team_id: validTeam ? Number(row.team_id) : null,
    raw_team_id: row.team_id ? Number(row.team_id) : null,
    team_name: text(row.official_name || row.short_name),
    gender: genderKey(row.gender),
    valid_team: validTeam,
    mark_raw: markRaw,
    mark_seconds: row.mark_seconds == null ? parseMarkSeconds(markRaw) : Number(row.mark_seconds),
    status_code: isStatusCode(markRaw) ? markRaw.toUpperCase() : null,
    place: Number.isInteger(Number(row.place)) && Number(row.place) > 0 ? Number(row.place) : null,
    round: normalizeRound(row.round).canonical,
    round_raw: text(row.round),
    relay_athletes: (row.relay_athletes || []).map((leg, index) => ({
      athlete_id: leg.athlete_id || leg.tfrrs_athlete_id || null,
      athlete_name: leg.athlete_name || null,
      leg_order: leg.leg_order || index + 1,
    })),
  };
}

function markIdentity(fact) {
  if (fact.status_code) return `status:${fact.status_code}`;
  if (Number.isFinite(Number(fact.mark_seconds))) return `seconds:${Number(fact.mark_seconds).toFixed(3)}`;
  const raw = normaliseMarkKey(fact.mark_raw);
  return raw ? `raw:${raw}` : 'missing';
}

function resultIdentity(fact) {
  return `${fact.team_id || ''}|${markIdentity(fact)}`;
}

function candidateScore(source, local) {
  let score = 0;
  if (source.place === local.place) score += 8;
  if (source.round && source.round === local.round) score += 4;
  if (!source.round || !local.round) score += 1;
  const sourceLineup = normalizedLineup(source.relay_athletes).join('|');
  const localLineup = normalizedLineup(local.relay_athletes).join('|');
  if (sourceLineup && sourceLineup === localLineup) score += 16;
  return score;
}

function selectUniqueCandidate(source, candidates) {
  if (candidates.length === 1) return candidates[0];
  const scored = candidates
    .map(candidate => ({ candidate, score: candidateScore(source, candidate) }))
    .sort((left, right) => right.score - left.score);
  if (!scored.length || scored[0].score === scored[1]?.score) return null;
  return scored[0].candidate;
}

function compactFact(fact) {
  return {
    source_record_key: fact.source_record_key || null,
    relay_result_id: fact.relay_result_id || null,
    team_id: fact.team_id || null,
    team_name: fact.team_name || null,
    gender: fact.gender || null,
    mark_raw: fact.mark_raw || null,
    mark_seconds: fact.mark_seconds ?? null,
    status_code: fact.status_code || null,
    place: fact.place ?? null,
    round: fact.round || null,
    source_url: fact.source_url || null,
    relay_athletes: fact.relay_athletes || [],
  };
}

function reconcileMeet({ meet, relationship, sourceSnapshot, sourceFacts = [], localFacts = [] } = {}) {
  const rel = relationship || classifyMeet(meet);
  const normalizedLocal = localFacts.map(normalizeLocalFact);

  if (rel.kind === 'combined_child') {
    return outcome('child', meet, rel, sourceSnapshot, [], normalizedLocal, {
      reason: 'verified_combined_events_child',
    });
  }

  if (rel.kind === 'combined_child_candidate') {
    return outcome('needs_review', meet, rel, sourceSnapshot, [], normalizedLocal, {
      reason: 'combined_events_parent_not_verified',
      unresolved_relationship: true,
    });
  }

  if (!sourceSnapshot || sourceSnapshot.status === 'unavailable') {
    return outcome('blocked', meet, rel, sourceSnapshot, [], normalizedLocal, {
      reason: sourceSnapshot?.reason || 'tfrrs_source_unavailable',
    });
  }

  if (sourceSnapshot.status === 'not_contested') {
    return outcome(normalizedLocal.length ? 'needs_review' : 'not_contested', meet, rel,
      sourceSnapshot, [], normalizedLocal, {
        reason: normalizedLocal.length
          ? 'tfrrs_has_no_4x100_but_local_rows_exist'
          : 'tfrrs_verified_no_4x100_event',
        extra: normalizedLocal,
      });
  }

  if (sourceSnapshot.status === 'present' && sourceFacts.length === 0) {
    return outcome('needs_review', meet, rel, sourceSnapshot, [], normalizedLocal, {
      reason: 'tfrrs_event_present_but_parser_returned_no_rows',
    });
  }

  const unresolvedSource = sourceFacts.filter(fact => !fact.team_id);
  const resolvedSource = sourceFacts.filter(fact => fact.team_id);
  const invalidLocal = normalizedLocal.filter(fact => !fact.valid_team);
  const validLocal = normalizedLocal.filter(fact => fact.valid_team);
  const unmatchedLocal = new Set(validLocal.map(fact => fact.relay_result_id));
  const matched = [];
  const conflicts = [];
  const missing = [];

  for (const source of resolvedSource) {
    const exactCandidates = validLocal.filter(local =>
      unmatchedLocal.has(local.relay_result_id)
      && resultIdentity(local) === resultIdentity(source)
    );
    const exact = selectUniqueCandidate(source, exactCandidates);
    if (exact) {
      unmatchedLocal.delete(exact.relay_result_id);
      matched.push({ source, local: exact });
      continue;
    }

    const teamCandidates = validLocal.filter(local =>
      unmatchedLocal.has(local.relay_result_id) && local.team_id === source.team_id
    );
    const remainingSourceForTeam = resolvedSource.filter(candidate =>
      candidate.team_id === source.team_id
      && !matched.some(pair => pair.source.source_record_key === candidate.source_record_key)
      && !conflicts.some(pair => pair.source.source_record_key === candidate.source_record_key)
    );
    if (teamCandidates.length === 1 && remainingSourceForTeam.length === 1) {
      const local = teamCandidates[0];
      unmatchedLocal.delete(local.relay_result_id);
      conflicts.push({ source, local, reason: 'same_team_different_result' });
      continue;
    }
    missing.push(source);
  }

  const extra = validLocal.filter(local => unmatchedLocal.has(local.relay_result_id));
  const status = unresolvedSource.length || invalidLocal.length || conflicts.length || missing.length || extra.length
    ? unresolvedSource.length ? 'needs_review' : 'repair_ready'
    : 'matched';

  return outcome(status, meet, rel, sourceSnapshot, sourceFacts, normalizedLocal, {
    reason: status === 'matched' ? 'tfrrs_and_database_match' : 'source_database_difference',
    matched,
    missing,
    extra,
    invalid_local: invalidLocal,
    unresolved_source: unresolvedSource,
    conflicts,
  });
}

function outcome(status, meet, relationship, sourceSnapshot, sourceFacts, localFacts, details = {}) {
  const matched = details.matched || [];
  const missing = details.missing || [];
  const extra = details.extra || [];
  const invalidLocal = details.invalid_local || [];
  const unresolvedSource = details.unresolved_source || [];
  const conflicts = details.conflicts || [];
  return {
    meet_id: Number(meet?.meet_id),
    meet_name: meet?.name || null,
    status,
    reason: details.reason || null,
    relationship,
    source_event_status: sourceSnapshot?.status || 'unknown',
    source_event_count: Number(sourceSnapshot?.event_count || 0),
    source_result_count: sourceFacts.length,
    local_result_count: localFacts.length,
    matched_result_count: matched.length,
    missing_result_count: missing.length + conflicts.length,
    extra_result_count: extra.length + conflicts.length,
    invalid_team_result_count: invalidLocal.length,
    unresolved_source_team_count: unresolvedSource.length,
    unresolved_relationship: Boolean(details.unresolved_relationship),
    diff: {
      matched: matched.map(pair => ({ source: compactFact(pair.source), local: compactFact(pair.local) })),
      missing: missing.map(compactFact),
      extra: extra.map(compactFact),
      invalid_local: invalidLocal.map(compactFact),
      unresolved_source: unresolvedSource.map(compactFact),
      conflicts: conflicts.map(pair => ({
        reason: pair.reason,
        source: compactFact(pair.source),
        local: compactFact(pair.local),
      })),
    },
  };
}

function buildRepairActions(result) {
  const actions = [];
  for (const source of result.diff?.missing || []) {
    actions.push({
      action_type: 'insert_missing',
      source_record_key: source.source_record_key,
      local_relay_result_id: null,
      source_payload: source,
      reason: 'verified_tfrrs_result_missing_locally',
      confidence: 1,
    });
  }
  for (const conflict of result.diff?.conflicts || []) {
    actions.push({
      action_type: 'supersede_local',
      source_record_key: conflict.source.source_record_key,
      local_relay_result_id: conflict.local.relay_result_id,
      source_payload: conflict.source,
      reason: 'same_team_local_result_conflicts_with_tfrrs',
      confidence: 1,
    });
    actions.push({
      action_type: 'insert_missing',
      source_record_key: conflict.source.source_record_key,
      local_relay_result_id: null,
      source_payload: conflict.source,
      reason: 'verified_tfrrs_replacement_for_conflicting_local_result',
      confidence: 1,
    });
  }
  for (const local of result.diff?.extra || []) {
    actions.push({
      action_type: 'supersede_local',
      source_record_key: null,
      local_relay_result_id: local.relay_result_id,
      source_payload: {},
      reason: 'local_result_not_present_on_verified_tfrrs_event',
      confidence: 0.95,
    });
  }
  for (const local of result.diff?.invalid_local || []) {
    actions.push({
      action_type: 'manual_review',
      source_record_key: null,
      local_relay_result_id: local.relay_result_id,
      source_payload: {},
      reason: 'local_result_has_broken_team_identity',
      confidence: 0,
    });
  }
  for (const source of result.diff?.unresolved_source || []) {
    actions.push({
      action_type: 'manual_review',
      source_record_key: source.source_record_key,
      local_relay_result_id: null,
      source_payload: source,
      reason: 'tfrrs_team_identity_not_resolved',
      confidence: 0,
    });
  }
  return actions;
}

module.exports = {
  EVENT_CODE,
  SOURCE,
  TeamCatalog,
  buildRepairActions,
  classifyMeet,
  markIdentity,
  normalizeLocalFact,
  normalizeMeetName,
  normalizeSourceFact,
  reconcileMeet,
};
