/**
 * Delete duplicate results (same athlete/meet/date/event/mark/round)
 * Keeps the one with the lowest result_id
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deleteDuplicates() {
  console.log('=== DELETING DUPLICATE RESULTS ===\n');

  // Process in batches by athlete to avoid timeout
  // Get athletes with potential duplicates

  let totalDeleted = 0;
  let athletesChecked = 0;

  // Get a sample of athletes to check
  const BATCH_SIZE = 100;
  let lastId = 0;

  while (true) {
    // Get batch of athletes
    const { data: athletes, error } = await supabase
      .from('athletes')
      .select('athlete_id')
      .gt('athlete_id', lastId)
      .order('athlete_id')
      .limit(BATCH_SIZE);

    if (error) {
      console.error('Error fetching athletes:', error.message);
      break;
    }

    if (!athletes || athletes.length === 0) break;

    lastId = athletes[athletes.length - 1].athlete_id;

    // Check each athlete for duplicates
    for (const athlete of athletes) {
      // Get all results for this athlete with date
      const { data: results } = await supabase
        .from('results')
        .select('result_id, meet_name, date, event_name, mark_raw, round')
        .eq('athlete_id', athlete.athlete_id)
        .not('date', 'is', null)
        .order('result_id');

      if (!results || results.length < 2) continue;

      // Group by key and find duplicates
      const seen = new Map();
      const toDelete = [];

      for (const r of results) {
        const key = `${r.meet_name}_${r.date}_${r.event_name}_${r.mark_raw}_${r.round}`;
        if (seen.has(key)) {
          // This is a duplicate - delete the one with higher ID
          toDelete.push(r.result_id);
        } else {
          seen.set(key, r.result_id);
        }
      }

      if (toDelete.length > 0) {
        const { error: delError } = await supabase
          .from('results')
          .delete()
          .in('result_id', toDelete);

        if (!delError) {
          totalDeleted += toDelete.length;
        }
      }
    }

    athletesChecked += athletes.length;
    process.stdout.write(`\rChecked ${athletesChecked.toLocaleString()} athletes, deleted ${totalDeleted.toLocaleString()} duplicates...`);
  }

  console.log(`\n\n✓ Done! Deleted ${totalDeleted.toLocaleString()} duplicate results`);
}

deleteDuplicates().catch(console.error);
