#!/usr/bin/env node
/**
 * Build `tfrrs/meet-scraper/meets-to-scrape.json` from meets that have a tfrrs_url but no results.
 *
 * These are the links recovered by match-2526-unlinked.js. Writing the list by hand invites
 * transcription errors, and the scraper keys on `db_meet_id` — a wrong id imports a real meet's
 * results onto the wrong meet, which is DUP-1 by another route.
 *
 * SAFETY: only emits meets with a genuine per-meet count of ZERO. `results_status` is not
 * trusted for this (CLAUDE.md §1: verify emptiness with an exact count, not the status column —
 * 31 meets were once marked 'imported' while holding nothing, and the reverse also happens).
 *
 *   node build-scrape-list-2526.js            # all empty meets holding a tfrrs_url
 *   node build-scrape-list-2526.js --first 13053   # put this meet_id first (for a --test pilot)
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const fi = process.argv.indexOf('--first');
const FIRST = fi >= 0 ? parseInt(process.argv[fi + 1], 10) : null;
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const OUT = path.join(__dirname, 'tfrrs/meet-scraper/meets-to-scrape.json');

(async () => {
  const c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 300000 });
  await c.connect();
  const { rows } = await c.query(`
    SELECT m.meet_id, m.name, m.date::text AS date, m.tfrrs_url
    FROM meets m
    WHERE m.tfrrs_url IS NOT NULL
      AND m.date >= '2025-08-01' AND m.date < '2026-08-01'
      AND (SELECT count(*) FROM results r WHERE r.meet_id = m.meet_id) = 0
    ORDER BY m.date`);
  await c.end();

  const list = rows.map(m => ({
    url: m.tfrrs_url,
    name: m.name,
    date: m.date,
    db_meet_id: m.meet_id,
    db_meet_name: m.name,
    tfrrs_meet_id: (String(m.tfrrs_url).match(/\/results\/(?:xc\/)?(\d+)/) || [])[1] || null,
  }));

  if (FIRST) {
    const i = list.findIndex(x => x.db_meet_id === FIRST);
    if (i > 0) list.unshift(list.splice(i, 1)[0]);
    if (i < 0) console.log(`note: --first ${FIRST} is not in the empty-with-link set`);
  }

  fs.writeFileSync(OUT, JSON.stringify(list, null, 2));
  console.log(`wrote ${list.length} meets to ${path.relative(process.cwd(), OUT)}`);
  list.forEach(m => console.log(`  #${m.db_meet_id}  ${m.date}  ${m.name}\n      ${m.url}`));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
