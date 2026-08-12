/**
 * Maintenance backfill: populate athletes.first_name / last_name from full_name where missing.
 *
 * Normally unnecessary — the importers now split names on insert via shared/name_parser.js.
 * Keep this as a safety net to sweep up any rows that slipped through (e.g. created by an older
 * code path). Uses the SAME parser as the scrapers, so results are consistent.
 *
 *   node tools/backfill-athlete-names.js           # dry run (counts + samples)
 *   node tools/backfill-athlete-names.js --apply    # write
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');
const { parseName } = require('./shared/name_parser');

const APPLY = process.argv.includes('--apply');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';

(async () => {
  const c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 25000, statement_timeout: 240000 });
  await c.connect();
  const rows = (await c.query(`SELECT athlete_id, full_name FROM athletes
    WHERE (first_name IS NULL OR first_name='') AND full_name IS NOT NULL AND full_name<>''`)).rows;
  const updates = [];
  let skipped = 0;
  for (const r of rows) {
    const p = parseName(r.full_name);
    if (p) updates.push([r.athlete_id, p.first_name, p.last_name]); else skipped++;
  }
  console.log(`missing first_name: ${rows.length} | splittable: ${updates.length} | skipped: ${skipped}`);
  if (APPLY && updates.length) {
    let done = 0;
    for (let i = 0; i < updates.length; i += 500) {
      const chunk = updates.slice(i, i + 500);
      const vals = chunk.map(u => `(${u[0]},${c.escapeLiteral(u[1])},${c.escapeLiteral(u[2])})`).join(',');
      await c.query(`UPDATE athletes a SET first_name=v.f, last_name=v.l, updated_at=now()
        FROM (VALUES ${vals}) AS v(id,f,l) WHERE a.athlete_id=v.id AND (a.first_name IS NULL OR a.first_name='')`);
      done += chunk.length;
    }
    console.log(`applied: ${done}`);
  } else if (!APPLY) {
    console.log('(dry run — pass --apply to write)');
  }
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
