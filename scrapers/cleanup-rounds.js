/**
 * Normalize round names in batches to avoid timeout
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function normalizeRounds() {
  console.log('=== NORMALIZING ROUNDS IN BATCHES ===\n');

  const normalizations = [
    { from: 'Heat%', to: 'Prelim', isLike: true },
    { from: 'P', to: 'Prelim', isLike: false },
    { from: 'Preliminaries', to: 'Prelim', isLike: false },
    { from: 'Preliminary', to: 'Prelim', isLike: false },
    { from: 'F', to: 'Final', isLike: false },
    { from: 'Finals', to: 'Final', isLike: false },
  ];

  const BATCH_SIZE = 5000;

  for (const norm of normalizations) {
    console.log(`\n${norm.from} → ${norm.to}:`);
    let updated = 0;

    while (true) {
      // Get batch of IDs
      let selectQuery = supabase
        .from('results')
        .select('result_id')
        .limit(BATCH_SIZE);

      if (norm.isLike) {
        selectQuery = selectQuery.ilike('round', norm.from);
      } else {
        selectQuery = selectQuery.eq('round', norm.from);
      }

      const { data: ids, error: selectError } = await selectQuery;

      if (selectError) {
        console.error(`  Error selecting:`, selectError.message);
        break;
      }

      if (!ids || ids.length === 0) {
        if (updated === 0) {
          console.log('  0 rows (skipped)');
        } else {
          console.log(`\n  ✓ Done: ${updated.toLocaleString()} rows`);
        }
        break;
      }

      // Update this batch
      const idList = ids.map(r => r.result_id);
      const { error: updateError } = await supabase
        .from('results')
        .update({ round: norm.to })
        .in('result_id', idList);

      if (updateError) {
        console.error(`  Error updating:`, updateError.message);
        break;
      }

      updated += ids.length;
      process.stdout.write(`\r  Updated ${updated.toLocaleString()}...`);
    }
  }

  // Verify
  console.log('\n\n=== VERIFICATION ===');
  const checks = ['Prelim', 'Final', 'P', 'F', 'Preliminaries', 'Finals'];

  for (const round of checks) {
    const { data } = await supabase.from('results').select('result_id').eq('round', round).limit(1);
    const hasRows = data && data.length > 0;
    console.log(`  ${round}: ${hasRows ? 'HAS ROWS' : '0'}`);
  }

  // Get actual counts
  const { count: prelimCount } = await supabase.from('results').select('*', { count: 'exact', head: true }).eq('round', 'Prelim');
  const { count: finalCount } = await supabase.from('results').select('*', { count: 'exact', head: true }).eq('round', 'Final');
  console.log(`\n  Prelim total: ${prelimCount?.toLocaleString() || 'unknown'}`);
  console.log(`  Final total: ${finalCount?.toLocaleString() || 'unknown'}`);
}

normalizeRounds().catch(console.error);
