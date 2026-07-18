#!/usr/bin/env node
/**
 * Batch athletic.net results import — works through every meet that has an
 * athletic_net_results_url and isn't imported yet, one at a time, throttled.
 * Safe to interrupt/re-run: the bridge is idempotent (fingerprint guard skips
 * anything already imported), and each meet's outcome is recorded on the meet row
 * (results_status / results_source / results_error).
 *
 *   node batch_import.js --limit 10 --commit     # first tranche
 *   node batch_import.js --commit                # everything remaining
 *   node batch_import.js --limit 5               # dry-run 5 (no writes)
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { run } = require('./import_meet_results');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const lIdx = args.indexOf('--limit');
  const limit = lIdx >= 0 ? parseInt(args[lIdx + 1], 10) : 0;

  let q = supabase.from('meets')
    .select('meet_id, name, date, results_status')
    .not('athletic_net_results_url', 'is', null)
    .neq('results_status', 'imported')
    .order('date', { ascending: false });
  if (limit) q = q.limit(limit);
  const { data: meets, error } = await q;
  if (error) throw error;

  console.log(`BATCH ${commit ? 'COMMIT' : 'DRY'}: ${meets.length} meets to process\n`);
  let ok = 0, failed = 0;
  for (const [i, m] of meets.entries()) {
    console.log(`\n[${i + 1}/${meets.length}] ======== meet ${m.meet_id} "${m.name}" (${m.date}) ========`);
    try {
      await run(m.meet_id, { commit });
      ok++;
    } catch (e) {
      failed++;
      console.log(`  FAILED: ${e.message}`);
      if (commit) {
        await supabase.from('meets')
          .update({ results_status: 'error', results_error: String(e.message).slice(0, 500) })
          .eq('meet_id', m.meet_id);
      }
    }
    await delay(5000); // throttle between meets — be polite to athletic.net
  }
  console.log(`\n${'='.repeat(60)}\nBATCH DONE: ${ok} ok, ${failed} failed of ${meets.length}`);
})().catch(e => { console.error('BATCH ERROR', e.message); process.exit(1); });
