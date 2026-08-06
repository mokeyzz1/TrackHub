#!/usr/bin/env node
/**
 * Re-run the athletic.net import over meets ALREADY sourced from athletic.net, to pick up relays.
 *
 * The original imports dropped every relay (relay rows have a team, not an athlete, so the bridge
 * skipped them as blank). Relay support now exists, but `batch_import.js` only targets *empty*
 * meets — so these already-filled meets need their own pass.
 *
 * Safe to run repeatedly: the bridge skips individual results it already imported (fingerprint
 * guard) and skips relays it already wrote (event_type + team + mark), so this only adds what's
 * missing.
 *
 *   node backfill_relays.js            # dry run
 *   node backfill_relays.js --commit   # write
 *   node backfill_relays.js --commit --limit 5
 */
const path = require('path');
const { execFileSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const NODE = process.execPath;
const BRIDGE = path.join(__dirname, 'import_meet_results.js');

(async () => {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const li = args.indexOf('--limit');
  const limit = li >= 0 ? parseInt(args[li + 1], 10) : 0;

  const { data: meets, error } = await supabase.from('meets')
    .select('meet_id, name, date')
    .eq('results_source', 'athletic_net')
    .order('date', { ascending: false });
  if (error) throw error;

  // only those still missing relays
  const todo = [];
  for (const m of meets) {
    const { count } = await supabase.from('relay_results')
      .select('*', { count: 'exact', head: true }).eq('meet_id', m.meet_id);
    if (!count) todo.push(m);
  }

  const list = limit ? todo.slice(0, limit) : todo;
  console.log(`athletic.net meets: ${meets.length} | already have relays: ${meets.length - todo.length} | to process: ${list.length}`);
  console.log(`MODE: ${commit ? 'COMMIT' : 'DRY'}\n`);

  let ok = 0, failed = 0;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    console.log(`[${i + 1}/${list.length}] meet ${m.meet_id} "${m.name}" (${m.date})`);
    try {
      const out = execFileSync(NODE, [BRIDGE, String(m.meet_id), ...(commit ? ['--commit'] : [])],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
      const line = out.split('\n').find(l => l.includes('RELAYS:'));
      if (line) console.log(' ', line.trim());
      ok++;
    } catch (e) {
      console.log(`  FAILED: ${(e.stderr || e.message || '').toString().split('\n')[0]}`);
      failed++;
    }
  }
  console.log(`\nBATCH DONE: ${ok} ok, ${failed} failed of ${list.length}`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
