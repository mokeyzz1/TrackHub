#!/usr/bin/env node
/**
 * Backfill NULL dates on results by looking up dates from other results at the same meet
 */

require('dotenv').config({ path: '../../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfillNullDates() {
  console.log('========================================');
  console.log('BACKFILL NULL DATES');
  console.log('========================================\n');

  // Step 1: Get unique meet names that have results with dates
  // We'll use those to fix NULL dates
  console.log('Finding meets with known dates...');

  const { data: meetsWithDates, error: meetsError } = await supabase
    .from('results')
    .select('meet_name, date')
    .not('date', 'is', null)
    .not('meet_name', 'is', null);

  if (meetsError) {
    console.error('Error:', meetsError);
    return;
  }

  // Build a map of meet_name -> date
  const meetDateMap = {};
  meetsWithDates.forEach(r => {
    if (!meetDateMap[r.meet_name]) {
      meetDateMap[r.meet_name] = r.date;
    }
  });

  console.log(`Found ${Object.keys(meetDateMap).length} meets with known dates\n`);

  // Step 2: Process each meet
  let totalFixed = 0;
  let totalSkipped = 0;
  const meetNames = Object.keys(meetDateMap);

  for (let i = 0; i < meetNames.length; i++) {
    const meetName = meetNames[i];
    const date = meetDateMap[meetName];

    // Update results with this meet_name that have NULL dates
    const { data: updated, error: updateError } = await supabase
      .from('results')
      .update({ date: date })
      .eq('meet_name', meetName)
      .is('date', null)
      .select('result_id');

    if (updateError) {
      console.log(`✗ Error updating "${meetName}":`, updateError.message);
      totalSkipped++;
    } else if (updated && updated.length > 0) {
      console.log(`✓ ${meetName}: Fixed ${updated.length} results → ${date}`);
      totalFixed += updated.length;
    }

    // Progress every 100 meets
    if ((i + 1) % 100 === 0) {
      console.log(`  Progress: ${i + 1}/${meetNames.length} meets processed...`);
    }
  }

  console.log('\n========================================');
  console.log('COMPLETE');
  console.log('========================================');
  console.log(`Fixed: ${totalFixed} results`);
  console.log(`Meets processed: ${meetNames.length}`);

  // Check remaining NULL dates (with meet names)
  const { data: remaining } = await supabase
    .from('results')
    .select('meet_name')
    .is('date', null)
    .not('meet_name', 'is', null)
    .limit(1000);

  console.log(`\nRemaining results with meet but no date: ${remaining?.length || 0}+`);

  if (remaining && remaining.length > 0) {
    const uniqueMeets = [...new Set(remaining.map(r => r.meet_name))];
    console.log('Sample meets still missing dates:');
    uniqueMeets.slice(0, 10).forEach(m => console.log('  -', m));
  }
}

backfillNullDates().catch(console.error);
