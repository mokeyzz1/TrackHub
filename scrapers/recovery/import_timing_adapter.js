#!/usr/bin/env node
/**
 * Import one 4x100 relay scope from a non-TFRRS timing provider through the private control
 * plane. This importer is intentionally relay-only and controlled-only: provider adapters never
 * write public facts directly, and unresolved identities remain visible for review.
 *
 * Examples:
 *   node recovery/import_timing_adapter.js --provider milesplit --meet 12365 --control-plane
 *   node recovery/import_timing_adapter.js --provider pt_timing --meet 13048 \
 *     --source-url 'https://live.pttiming.com/?mid=8642' --control-plane
 */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { EventResolver } = require('../shared/event_resolver');
const { normalizeSourceRows } = require('../shared/source_observation_adapter');
const { TeamAliasResolver } = require('../shared/team_alias_resolver');
const { AthleteAliasResolver } = require('../shared/athlete_alias_resolver');
const {
  CompositeAthleteResolver,
  CompositeTeamResolver,
  loadExactAthleteResolver,
  loadExactTeamResolver
} = require('../shared/conservative_identity_resolver');
const { ControlledIngestion } = require('../shared/controlled_ingestion');
const { ensureIngestDatabaseUrl } = require('../shared/private_database_url');
const { requireControlledCommit } = require('../shared/write_mode_guard');
const {
  FOUR_BY_100,
  assertSourceDate,
  fetchTimingRows
} = require('./timing_adapters');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PROVIDERS = new Set(['milesplit', 'pt_timing', 'leonetiming']);

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseArgs(argv) {
  const provider = valueAfter(argv, '--provider');
  if (!PROVIDERS.has(provider)) {
    throw new Error('--provider must be milesplit, pt_timing, or leonetiming');
  }
  const meetId = positiveInteger(valueAfter(argv, '--meet'), '--meet');
  const eventCode = valueAfter(argv, '--event-code') || FOUR_BY_100;
  if (eventCode !== FOUR_BY_100) throw new Error('--event-code currently supports only 4x100m');
  const commit = argv.includes('--commit');
  const controlPlane = argv.includes('--control-plane');
  requireControlledCommit({
    commit,
    controlPlane,
    legacyDirectWrite: false,
    importer: `${provider} timing adapter`
  });
  return {
    provider,
    meetId,
    sourceUrl: valueAfter(argv, '--source-url'),
    eventCode,
    commit,
    controlPlane,
    timeoutMs: positiveInteger(valueAfter(argv, '--timeout-ms') || 30000, '--timeout-ms')
  };
}

function environmentFor(season) {
  const value = String(season || '').toLowerCase();
  if (value.startsWith('indoor')) return 'indoor';
  if (value.startsWith('outdoor')) return 'outdoor';
  if (value.startsWith('xc')) return 'xc';
  return null;
}

async function loadMeet(meetId) {
  const { data, error } = await supabase
    .from('meets')
    .select('meet_id,name,date,end_date,season,meet_url')
    .eq('meet_id', meetId)
    .single();
  if (error || !data) throw new Error(`meet ${meetId} not found: ${error?.message || 'unknown error'}`);
  return data;
}

function addSourceMetadata(rows, meet, sourceResult, provider) {
  const environment = environmentFor(meet.season);
  return rows.map(row => ({
    ...row,
    source: provider,
    target_meet_id: meet.meet_id,
    meet_id: meet.meet_id,
    meet_name: row.meet_name || meet.name,
    // The canonical meet date is the destination fact date. Source start/end dates are retained
    // in source_payload for audit, because several timing platforms serialize local meet dates
    // one day earlier than the database's inclusive meet date.
    date: meet.date,
    environment,
    source_url: row.source_url || sourceResult.sourceUrl,
    payload: {
      provider,
      source_meet_id: sourceResult.sourceMeetId,
      source_url: sourceResult.sourceUrl,
      source_event_name: row.source_event_name || null,
      source_payload: row.source_payload || null,
      environment
    }
  }));
}

async function run(args) {
  ensureIngestDatabaseUrl();
  const meet = await loadMeet(args.meetId);
  const sourceUrl = args.sourceUrl || meet.meet_url;
  if (!sourceUrl) throw new Error(`meet ${meet.meet_id} has no timing-platform meet_url`);

  const sourceResult = await fetchTimingRows({
    source: args.provider,
    sourceUrl,
    targetMeetId: meet.meet_id,
    targetMeet: meet,
    timeoutMs: args.timeoutMs
  });
  assertSourceDate(sourceResult, meet);
  const sourceRows = addSourceMetadata(sourceResult.rows, meet, sourceResult, args.provider);

  const events = new EventResolver();
  await events.load(supabase);
  const controlled = new ControlledIngestion();
  controlled.ownsStore = false;
  try {
    const teamAliases = await TeamAliasResolver.load(controlled.store.pool, args.provider);
    const athleteAliases = await AthleteAliasResolver.load(controlled.store.pool, args.provider);
    const exactTeams = await loadExactTeamResolver(controlled.store.pool);
    const teamResolver = new CompositeTeamResolver(teamAliases, exactTeams);
    const exactAthletes = await loadExactAthleteResolver(controlled.store.pool, sourceRows, teamResolver);
    const athleteResolver = new CompositeAthleteResolver(athleteAliases, exactAthletes);
    const records = normalizeSourceRows(args.provider, sourceRows, events, {
      teamResolver,
      athleteResolver,
      requireNamedTeam: true
    });
    const outcome = await controlled.run({
      source: args.provider,
      mode: args.commit ? 'commit' : 'dry_run',
      scope: {
        meet_id: meet.meet_id,
        source_meet_id: sourceResult.sourceMeetId,
        source_url: sourceResult.sourceUrl,
        event_code: args.eventCode,
        relays_only: true,
        source_observation_count: sourceRows.length,
        source_event_count: args.provider === 'milesplit'
          ? sourceResult.events?.length || 0
          : Object.keys(sourceResult.meetEvents || {}).length
      },
      parserVersion: `${args.provider}-${args.provider === 'milesplit' ? 'firestore' : 'karmarush-firebase'}-4x100-v1`,
      records,
      commit: args.commit
    });

    console.log(`Timing source=${args.provider} url=${sourceResult.sourceUrl}`);
    console.log(`  source_meet=${sourceResult.sourceMeetId} relay_rows=${sourceRows.length} normalized=${records.length}`);
    console.log(`CONTROL PLANE RUN ${outcome.runId}`);
    console.log(`  staged=${outcome.staged_observations} inserted=${outcome.inserted || 0} claimed=${outcome.claimed || 0} skipped=${outcome.skipped || 0} quarantined=${outcome.quarantined || 0}`);
    if (!sourceRows.length) console.log('SOURCE STATUS: EMPTY');
    return { ...outcome, sourceRows: sourceRows.length, provider: args.provider };
  } finally {
    await controlled.store.close();
  }
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).catch(error => {
    console.error(`Timing adapter import failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  PROVIDERS,
  addSourceMetadata,
  environmentFor,
  loadMeet,
  parseArgs,
  run
};
