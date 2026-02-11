/**
 * Backfill mark_seconds for all results
 * Uses batch updates for speed
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseTimeToSeconds(mark) {
  if (!mark) return null;
  const cleaned = mark.trim();

  // Seconds only: '7.47', '10.23'
  if (/^\d+\.\d+$/.test(cleaned)) {
    return parseFloat(cleaned);
  }

  // Min:Sec: '1:45.67', '24:32.10'
  const minSec = cleaned.match(/^(\d+):(\d+\.\d+)$/);
  if (minSec) {
    return parseInt(minSec[1]) * 60 + parseFloat(minSec[2]);
  }

  // Hour:Min:Sec: '1:02:34.56'
  const hourMinSec = cleaned.match(/^(\d+):(\d+):(\d+\.\d+)$/);
  if (hourMinSec) {
    return parseInt(hourMinSec[1]) * 3600 + parseInt(hourMinSec[2]) * 60 + parseFloat(hourMinSec[3]);
  }

  return null;
}

async function backfill() {
  const BATCH_SIZE = 5000;
  let totalUpdated = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 500; // Safety limit

  console.log('Starting backfill of mark_seconds...\n');

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // Fetch batch
    const { data, error } = await supabase
      .from('results')
      .select('result_id, mark_raw')
      .is('mark_seconds', null)
      .not('mark_raw', 'is', null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error('Fetch error:', error.message);
      break;
    }

    if (!data || data.length === 0) {
      console.log('\nDone! No more results to process.');
      break;
    }

    // Group by parsed seconds value for batch updates
    const bySeconds = new Map();
    for (const r of data) {
      const seconds = parseTimeToSeconds(r.mark_raw);
      if (seconds !== null) {
        if (!bySeconds.has(seconds)) bySeconds.set(seconds, []);
        bySeconds.get(seconds).push(r.result_id);
      }
    }

    // Update each group
    for (const [seconds, ids] of bySeconds) {
      const { error: updateError } = await supabase
        .from('results')
        .update({ mark_seconds: seconds })
        .in('result_id', ids);

      if (!updateError) {
        totalUpdated += ids.length;
      }
    }

    process.stdout.write(`\rIteration ${iterations}: Updated ${totalUpdated.toLocaleString()} results...`);
  }

  console.log('\n\n=== BACKFILL COMPLETE ===');
  console.log('Total updated:', totalUpdated.toLocaleString());

  // Check remaining
  const { count } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .is('mark_seconds', null);

  console.log('Still missing:', count?.toLocaleString() || 0);
}

backfill().catch(console.error);
