/**
 * Migrate old relay results (individual athlete rows) to new relay tables (team-based)
 *
 * Old format: Each athlete has their own row in results table
 * New format: One relay_result row with linked relay_athletes
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Relay event names in old data
const RELAY_EVENTS = [
  '4x400', '4x100', 'DMR', '4x800', '4x200', '4x300',
  '4x1600', '4x1500', 'SMR', '4xMile', '4x440y', '4x880y',
  '4x220y', '4x1000', 'SMR (800)', 'DMR (3800)', 'SHR', 'SHR (400)'
];

// Map old event names to standardized names
const EVENT_NAME_MAP = {
  '4x400': '4 x 400 Relay',
  '4x100': '4 x 100 Relay',
  '4x200': '4 x 200 Relay',
  '4x800': '4 x 800 Relay',
  '4x300': '4 x 300 Relay',
  '4x1600': '4 x 1600 Relay',
  '4x1500': '4 x 1500 Relay',
  '4xMile': '4 x Mile Relay',
  '4x440y': '4 x 440 Relay (Yards)',
  '4x880y': '4 x 880 Relay (Yards)',
  '4x220y': '4 x 220 Relay (Yards)',
  '4x1000': '4 x 1000 Relay',
  'DMR': 'Distance Medley Relay',
  'DMR (3800)': 'Distance Medley Relay',
  'SMR': 'Sprint Medley Relay',
  'SMR (800)': 'Sprint Medley Relay',
  'SHR': 'Shuttle Hurdle Relay',
  'SHR (400)': 'Shuttle Hurdle Relay'
};

async function migrateOldRelays(commit = false) {
  console.log('========================================');
  console.log(commit ? 'MIGRATING OLD RELAY RESULTS' : 'DRY RUN');
  console.log('========================================\n');

  // Load old relay results
  console.log('Loading old relay results...');
  let allRelays = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('results')
      .select('result_id, athlete_id, event_name, mark_raw, mark_seconds, place, meet_name, date, team_id')
      .is('meet_id', null)
      .in('event_name', RELAY_EVENTS)
      .range(offset, offset + 999);

    if (error) {
      console.error('Error loading:', error.message);
      break;
    }

    if (!data || data.length === 0) break;
    allRelays = allRelays.concat(data);
    offset += 1000;

    if (offset % 50000 === 0) {
      console.log(`  Loaded ${offset.toLocaleString()} results...`);
    }
  }

  console.log(`Loaded ${allRelays.length.toLocaleString()} old relay results\n`);

  // Group by (meet_name, event_name, team_id, mark_raw, date) to identify unique relay performances
  console.log('Grouping into team relays...');
  const relayGroups = new Map();

  for (const r of allRelays) {
    // Create a key for this relay performance
    const key = `${r.meet_name}|${r.event_name}|${r.team_id}|${r.mark_raw}|${r.date}`;

    if (!relayGroups.has(key)) {
      relayGroups.set(key, {
        meet_name: r.meet_name,
        event_name: r.event_name,
        team_id: r.team_id,
        mark_raw: r.mark_raw,
        mark_seconds: r.mark_seconds,
        place: r.place,
        date: r.date,
        athletes: [],
        result_ids: []
      });
    }

    const group = relayGroups.get(key);
    group.athletes.push({
      athlete_id: r.athlete_id,
      result_id: r.result_id
    });
    group.result_ids.push(r.result_id);
  }

  console.log(`Found ${relayGroups.size.toLocaleString()} unique relay performances\n`);

  // Analyze groupings
  const athleteCounts = {};
  for (const [, group] of relayGroups) {
    const count = group.athletes.length;
    athleteCounts[count] = (athleteCounts[count] || 0) + 1;
  }

  console.log('Athletes per relay:');
  Object.entries(athleteCounts).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([count, num]) => {
    console.log(`  ${count} athletes: ${num.toLocaleString()} relays`);
  });

  // Sample
  console.log('\nSample relay groups (first 3):');
  let count = 0;
  for (const [key, group] of relayGroups) {
    if (count >= 3) break;
    console.log(`  ${group.event_name} | ${group.mark_raw} | ${group.meet_name}`);
    console.log(`    Athletes: ${group.athletes.length} | Team ID: ${group.team_id}`);
    count++;
  }

  if (!commit) {
    console.log('\n>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to migrate');
    return;
  }

  // Migrate to new tables
  console.log('\nMigrating to relay_results and relay_athletes...');
  let migrated = 0;
  let errors = 0;
  const resultIdsToDelete = [];

  const groups = [...relayGroups.values()];

  for (let i = 0; i < groups.length; i += 100) {
    const batch = groups.slice(i, i + 100);

    // Insert relay results
    const relayInserts = batch.map(g => ({
      team_id: g.team_id,
      event_name: EVENT_NAME_MAP[g.event_name] || g.event_name,
      mark_raw: g.mark_raw,
      mark_seconds: g.mark_seconds,
      place: g.place,
      meet_name: g.meet_name,
      date: g.date,
      round: null,
      meet_id: null,
      event_id: null
    }));

    const { data: insertedRelays, error: relayError } = await supabase
      .from('relay_results')
      .insert(relayInserts)
      .select('relay_result_id');

    if (relayError) {
      console.log(`  Batch ${Math.floor(i / 100) + 1} error: ${relayError.message}`);
      errors += batch.length;
      continue;
    }

    // Insert relay athletes
    const athleteInserts = [];
    insertedRelays.forEach((relay, idx) => {
      const group = batch[idx];
      group.athletes.forEach((a, legOrder) => {
        athleteInserts.push({
          relay_result_id: relay.relay_result_id,
          athlete_id: a.athlete_id,
          tfrrs_athlete_id: null,
          athlete_name: null, // We don't have names in old data
          leg_order: legOrder + 1
        });
      });
      // Collect result IDs to delete
      resultIdsToDelete.push(...group.result_ids);
    });

    if (athleteInserts.length > 0) {
      const { error: athleteError } = await supabase
        .from('relay_athletes')
        .insert(athleteInserts);

      if (athleteError) {
        console.log(`  Relay athletes error: ${athleteError.message}`);
      }
    }

    migrated += batch.length;

    if ((i + 100) % 5000 === 0) {
      console.log(`  ${migrated.toLocaleString()}/${groups.length.toLocaleString()} migrated`);
    }
  }

  console.log(`\nMigrated ${migrated.toLocaleString()} relay results`);

  // Delete old results from results table
  console.log(`\nDeleting ${resultIdsToDelete.length.toLocaleString()} old relay rows from results table...`);
  let deleted = 0;

  for (let i = 0; i < resultIdsToDelete.length; i += 500) {
    const batch = resultIdsToDelete.slice(i, i + 500);
    const { error: deleteError } = await supabase
      .from('results')
      .delete()
      .in('result_id', batch);

    if (deleteError) {
      console.log(`  Delete error: ${deleteError.message}`);
    } else {
      deleted += batch.length;
    }

    if ((i + 500) % 50000 === 0) {
      console.log(`  Deleted ${deleted.toLocaleString()}/${resultIdsToDelete.length.toLocaleString()}`);
    }
  }

  console.log('\n========================================');
  console.log('COMPLETE');
  console.log('========================================');
  console.log(`Relay results migrated: ${migrated.toLocaleString()}`);
  console.log(`Old rows deleted: ${deleted.toLocaleString()}`);
  console.log(`Errors: ${errors}`);
}

const commit = process.argv.includes('--commit');
migrateOldRelays(commit).catch(console.error);
