#!/usr/bin/env node
/**
 * TrackScoreboard -> private ingestion control plane.
 *
 * TrackScoreboard stores a meet as public Firebase JSON rather than HTML tables. This adapter
 * converts only relay result rows into the shared observation contract. It never creates schools
 * or athletes from a name alone: team aliases and exact name+gender+school matches are required;
 * everything else is quarantined for review.
 *
 *   node import_meet_results.js --meet 11948 --control-plane
 *   node import_meet_results.js --meet 11948 --control-plane --commit
 */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { EventResolver } = require('../shared/event_resolver');
const { ControlledIngestion } = require('../shared/controlled_ingestion');
const { normalizeSourceRows } = require('../shared/source_observation_adapter');
const { TeamAliasResolver } = require('../shared/team_alias_resolver');
const { AthleteAliasResolver } = require('../shared/athlete_alias_resolver');
const { parseMark } = require('../shared/mark_parser');
const { ensureIngestDatabaseUrl } = require('../shared/private_database_url');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const UNATTACHED_SCHOOL_ID = 1835;

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const meetId = valueAfter(argv, '--meet');
  if (!meetId || !/^\d+$/.test(meetId)) throw new Error('--meet must be a numeric database meet_id');
  if (!argv.includes('--control-plane')) throw new Error('--control-plane is required');
  return {
    meetId: Number(meetId),
    commit: argv.includes('--commit'),
    tenant: valueAfter(argv, '--tenant') || null,
    sourceUrl: valueAfter(argv, '--source-url') || null,
  };
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function genderCode(value) {
  const key = String(value || '').trim().toUpperCase();
  return key === 'W' || key === 'F' ? 'F' : key === 'M' ? 'M' : null;
}

function sourceEventName(rawName) {
  const name = String(rawName || '').replace(/^(women'?s?|men'?s?)\s+/i, '').trim();
  if (/^4x100\s+shuttle\s+hurdle/i.test(name)) return '4x100 Shuttle Hurdles';
  if (/^4x110\s+shuttle\s+hurdle/i.test(name)) return '4x110 Shuttle Hurdles';
  if (/^mixed\s+4x400/i.test(name)) return 'Mixed 4x400m Relay';
  if (/^4x100\s+relay/i.test(name)) return '4 x 100 Relay';
  if (/^4x200\s+relay/i.test(name)) return '4 x 200 Relay';
  if (/^4x400\s+relay/i.test(name)) return '4 x 400 Relay';
  if (/^4x800\s+relay/i.test(name)) return '4 x 800 Relay';
  if (/^1600\s+mixto/i.test(name)) return '1600m Mixto Corto';
  if (/^4000\s+mixto/i.test(name)) return '4000m Mixto Largo';
  return name;
}

function meetDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseSourceUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.trackscoreboard.com')) {
    throw new Error(`unsupported TrackScoreboard URL: ${value}`);
  }
  const match = url.pathname.match(/^\/meets\/(\d+)/);
  if (!match) throw new Error(`TrackScoreboard URL must identify /meets/<id>: ${value}`);
  return { url: value, host: url.hostname, sourceMeetId: Number(match[1]) };
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TrackScoreboard HTTP ${response.status}: ${url}`);
  return response.json();
}

async function resolveSource({ meet, sourceUrl, tenant }) {
  const parsed = parseSourceUrl(sourceUrl || meet.source_url);
  if (!parsed) throw new Error(`meet ${meet.meet_id} has no verified TrackScoreboard source_url`);
  const config = await getJson(`https://${parsed.host}/assets/appConfig.json`);
  const sourceTenant = tenant || config.company;
  if (!sourceTenant) throw new Error(`TrackScoreboard app config has no company for ${parsed.host}`);
  return {
    ...parsed,
    tenant: sourceTenant,
    firebaseBase: `https://track-scoreboard-default-rtdb.firebaseio.com/trackscoreboard/${encodeURIComponent(sourceTenant)}/meets/${parsed.sourceMeetId}/meet`,
  };
}

function extractRelayRows(payload) {
  const rows = [];
  const seen = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (Array.isArray(value.athletes) && (value.teamName || value.teamsAbbr) &&
        (value.mark != null || value.status != null)) {
      const key = `${value.id || ''}|${value.teamName || ''}|${value.mark || value.status || ''}|${value.place || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(value);
      }
    }
    Object.values(value).forEach(walk);
  }
  walk(payload);
  return rows;
}

async function loadExactAthletes(names) {
  const byKey = new Map();
  const unique = [...new Set(names.map(name => String(name || '').trim()).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const batch = unique.slice(i, i + 200);
    const { data, error } = await supabase
      .from('athletes')
      .select('athlete_id, full_name, gender, school_id')
      .in('full_name', batch);
    if (error) throw new Error(`athlete lookup failed: ${error.message}`);
    for (const athlete of data || []) {
      const key = `${normalizeName(athlete.full_name)}|${athlete.gender || ''}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(athlete);
    }
  }
  return byKey;
}

async function loadTeamSchools(teamIds) {
  if (!teamIds.length) return new Map();
  const { data, error } = await supabase.from('teams').select('team_id, school_id').in('team_id', teamIds);
  if (error) throw new Error(`team lookup failed: ${error.message}`);
  return new Map((data || []).map(row => [Number(row.team_id), Number(row.school_id)]));
}

function toRows({ sourceMeetId, sourceUrl, tenant, meet, events, eventPayloads, teamAliases, athleteAliases, athleteByKey, teamSchools }) {
  const rows = [];
  let teamMatched = 0;
  let athleteMatched = 0;
  let rawCount = 0;

  for (const event of events) {
    if (!event || !event.id) continue;
    const rawEventName = event.rounds?.Final?.name || event.name || null;
    const eventName = sourceEventName(rawEventName);
    const eventGender = genderCode(event.gender);
    for (const result of extractRelayRows(eventPayloads.get(Number(event.id)))) {
      rawCount++;
      const sourceTeamKey = result.teamsAbbr || result.teamName || null;
      const teamResolution = teamAliases.resolve({
        source: 'trackscoreboard',
        sourceTeamKey,
        sourceTeamName: result.teamName,
        sourceGender: eventGender,
      });
      if (teamResolution?.team_id) teamMatched++;
      const schoolId = teamSchools.get(Number(teamResolution?.team_id));
      const relayAthletes = (result.athletes || []).map((athlete, index) => {
        const fullName = `${athlete.fname || ''} ${athlete.lname || ''}`.replace(/\s+/g, ' ').trim();
        const sourceAthleteKey = `${tenant}|${athlete.id || normalizeName(fullName)}`;
        const key = `${normalizeName(fullName)}|${athlete.gender || eventGender || ''}`;
        const candidates = (athleteByKey.get(key) || []).filter(candidate =>
          !schoolId || Number(candidate.school_id) === Number(schoolId)
        );
        const alias = athleteAliases?.resolve({
          source: 'trackscoreboard',
          sourceAthleteKey,
        });
        const aliasMatchesSchool = alias?.athlete_id
          && (!schoolId
            || Number(alias.school_id) === Number(schoolId)
            || Number(alias.school_id) === UNATTACHED_SCHOOL_ID);
        const athleteId = aliasMatchesSchool
          ? Number(alias.athlete_id)
          : candidates.length === 1 ? Number(candidates[0].athlete_id) : null;
        if (athleteId) athleteMatched++;
        return {
          athlete_id: athleteId,
          athlete_name: fullName || null,
          source_athlete_key: sourceAthleteKey,
          leg_order: Number(athlete.athlete_position) || index + 1,
        };
      });
      const markRaw = result.mark || result.status || null;
      const parsed = parseMark(markRaw);
      rows.push({
        is_relay: true,
        source_meet_key: String(sourceMeetId),
        source_event_key: String(event.id),
        source_url: sourceUrl,
        source_team_key: sourceTeamKey,
        team_name: result.teamName || sourceTeamKey,
        team_gender: eventGender,
        event_name: eventName,
        mark_raw: markRaw,
        mark_seconds: parsed.mark_seconds,
        mark_meters: parsed.mark_meters,
        place: Number(result.place) > 0 ? Number(result.place) : null,
        round: 'Finals',
        date: meet.date,
        meet_id: meet.meet_id,
        meet_name: meet.name,
        ordinal: result.id || `${event.id}:${rawCount}`,
        relay_athletes: relayAthletes,
        payload: {
          tenant,
          source_meet_id: sourceMeetId,
          source_event_id: event.id,
          raw_event_name: rawEventName,
          raw_result: result,
        },
      });
    }
  }
  return { rows, rawCount, teamMatched, athleteMatched };
}

async function run({ meetId, commit = false, tenant = null, sourceUrl = null } = {}) {
  ensureIngestDatabaseUrl();
  const { data: meet, error: meetError } = await supabase
    .from('meets')
    .select('meet_id,name,date,end_date,source_url')
    .eq('meet_id', meetId)
    .single();
  if (meetError || !meet) throw new Error(`meet ${meetId} not found: ${meetError?.message || 'unknown error'}`);

  const source = await resolveSource({ meet, sourceUrl, tenant });
  const sourceMeet = await getJson(`${source.firebaseBase}/meet.json`);
  if (Number(sourceMeet?.meet_id) !== Number(source.sourceMeetId)) {
    throw new Error(`TrackScoreboard meet payload ID mismatch: expected ${source.sourceMeetId}`);
  }
  const sourceDate = meetDate(sourceMeet.date);
  if (sourceDate !== String(meet.date).slice(0, 10)) {
    throw new Error(`TrackScoreboard date mismatch: source=${sourceDate} database=${meet.date}`);
  }

  const eventMap = await getJson(`${source.firebaseBase}/events.json`);
  const events = Object.values(eventMap || {}).filter(Boolean);
  const eventPayloads = new Map();
  for (const event of events) {
    if (!event.id) continue;
    eventPayloads.set(Number(event.id), await getJson(`${source.firebaseBase}/results/${event.id}.json`));
  }

  const rawRows = [];
  for (const event of events) {
    rawRows.push(...extractRelayRows(eventPayloads.get(Number(event.id))));
  }
  const names = rawRows.flatMap(row => (row.athletes || []).map(athlete =>
    `${athlete.fname || ''} ${athlete.lname || ''}`.replace(/\s+/g, ' ').trim()
  ));

  const controlled = new ControlledIngestion();
  // ControlledIngestion normally owns and closes its store. This adapter also needs cleanup when
  // parsing fails before run(), so transfer ownership to this outer finally block exactly once.
  controlled.ownsStore = false;
  try {
    const teamAliases = await TeamAliasResolver.load(controlled.store.pool, 'trackscoreboard');
    const athleteAliases = await AthleteAliasResolver.load(controlled.store.pool, 'trackscoreboard');
    const preRows = rawRows.map(row => ({
      team_name: row.teamName,
      source_team_key: row.teamsAbbr || row.teamName,
    }));
    const teamIds = [...new Set(preRows.flatMap(row => ['M', 'F'].map(sourceGender => teamAliases.resolve({
      source: 'trackscoreboard',
      sourceTeamKey: row.source_team_key,
      sourceTeamName: row.team_name,
      sourceGender,
    })?.team_id).filter(Boolean)))];
    const teamSchools = await loadTeamSchools(teamIds);
    const athleteByKey = await loadExactAthletes(names);
    const { rows, rawCount, teamMatched, athleteMatched } = toRows({
      sourceMeetId: source.sourceMeetId,
      sourceUrl: source.url,
      tenant: source.tenant,
      meet,
      events,
      eventPayloads,
      teamAliases,
      athleteAliases,
      athleteByKey,
      teamSchools,
    });
    // EventResolver must be loaded before resolving names; unmapped source phrases remain visible
    // as quarantines instead of being guessed into a nearby event.
    const eventResolver = new EventResolver();
    await eventResolver.load(supabase);
    const normalized = normalizeSourceRows('trackscoreboard', rows, eventResolver, { teamResolver: teamAliases });
    const outcome = await controlled.run({
      source: 'trackscoreboard',
      mode: commit ? 'commit' : 'dry_run',
      scope: {
        meet_ids: [meet.meet_id],
        source_meet_id: source.sourceMeetId,
        tenant: source.tenant,
        source_url: source.url,
        source_observation_count: rawCount,
        source_event_count: events.length,
      },
      parserVersion: 'trackscoreboard-firebase-v1',
      records: normalized,
      commit,
    });
    console.log(`TrackScoreboard source=${source.url}`);
    console.log(`  events=${events.length} relay_rows=${rawCount} team_matched=${teamMatched} athlete_matched=${athleteMatched}`);
    console.log(`CONTROL PLANE RUN ${outcome.runId}`);
    console.log(`  staged=${outcome.staged_observations} inserted=${outcome.inserted || 0} claimed=${outcome.claimed || 0} skipped=${outcome.skipped || 0} quarantined=${outcome.quarantined || 0}`);
    if (!rawCount) console.log('SOURCE STATUS: EMPTY');
    return { ...outcome, rawCount, teamMatched, athleteMatched };
  } finally {
    await controlled.store.close();
  }
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).catch(error => {
    console.error(`TrackScoreboard import failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  extractRelayRows,
  normalizeName,
  parseArgs,
  parseSourceUrl,
  run,
  sourceEventName,
  toRows,
};
