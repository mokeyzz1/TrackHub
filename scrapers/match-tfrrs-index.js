#!/usr/bin/env node
/**
 * Match link-less meets against the cached TFRRS index — WITH VERIFICATION.
 *
 * `crawl-tfrrs-index.js` cached 1,757 TFRRS meets. 1,020 of our meets need a results link (empty,
 * or holding a fully-timeless 4x100) and 527 have exactly one name candidate in that index.
 *
 * ⚠️ A NAME MATCH IS NOT A LINK. This is exactly how DUP-1 happened: the existing fuzzy matcher
 * strips invitational|indoor|outdoor|classic|open|championships and the year, so "Big West Track &
 * Field Championships" becomes "big west" -- and Big Ten results ended up in three wrong
 * conferences. The owner's standing rule is that fuzzy is acceptable for old meets ONLY IF the
 * matches are reviewed before commit.
 *
 * So every candidate must clear a falsifiable check before its URL is stored:
 *   1. the candidate PAGE's own date text must contain our meet's date (±3 days)
 *   2. reject if our meet's name and the candidate differ on a DISCRIMINATING token
 *      (a conference/division word like "big west" vs "big ten" -- the exact DUP-1 failure)
 * Anything that fails is reported, never written.
 *
 *   node match-tfrrs-index.js                # verify + report only
 *   node match-tfrrs-index.js --apply        # store tfrrs_url for verified matches
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');
const axios = require('axios');
const cheerio = require('cheerio');
const idx = require('./tfrrs-meet-index.json');

const APPLY = process.argv.includes('--apply');
const li = process.argv.indexOf('--limit');
const LIMIT = li >= 0 ? parseInt(process.argv[li + 1], 10) : 0;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\b(20\d\d)\b/g,'').replace(/\s+/g,' ').trim();
// tokens that MUST agree — a mismatch here means a different meet, however similar the rest reads
const DISCRIMINATING = /\b(ten|west|east|north|south|12|10|big|sky|american|usa|atlantic|pacific|mountain|summit|patriot|ivy|colonial|horizon|missouri|valley|sun|belt|southland|caa|mac|mavc|wac|gnac|riverside|northeast|northwest|southeast|southwest|i{1,3}|iv|division)\b/g;
const tokens = s => new Set((norm(s).match(DISCRIMINATING) || []));

(async () => {
  const byName = new Map();
  idx.forEach(m => { const k = norm(m.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(m); });

  const c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
  await c.connect();
  await c.query(`CREATE TEMP TABLE rc AS SELECT meet_id, count(*)::int n FROM results WHERE meet_id IS NOT NULL GROUP BY 1`);
  await c.query('CREATE INDEX ON rc(meet_id)');
  const { rows: need } = await c.query(`
    WITH broken AS (
      SELECT rr.meet_id FROM relay_results rr JOIN event_types et ON et.event_type_id=rr.event_type_id
      WHERE rr.meet_id IS NOT NULL AND et.code='4x100m'
      GROUP BY 1 HAVING count(*) FILTER (WHERE rr.mark_raw ~ '\\d')=0)
    SELECT m.meet_id, m.name, m.date::text AS date
    FROM meets m LEFT JOIN rc ON rc.meet_id=m.meet_id
    WHERE m.tfrrs_url IS NULL
      AND (COALESCE(rc.n,0)=0 OR m.meet_id IN (SELECT meet_id FROM broken))
    ORDER BY m.date DESC`);

  const cands = [];
  for (const m of need) {
    const list = byName.get(norm(m.name));
    if (!list || list.length !== 1) continue;
    const cand = list[0];
    // token gate BEFORE any network call
    const a = tokens(m.name), b = tokens(cand.name);
    const disagree = [...a].filter(t => !b.has(t)).concat([...b].filter(t => !a.has(t)));
    if (disagree.length) continue;
    cands.push({ ...m, cand });
  }
  console.log(`unambiguous name matches passing the token gate: ${cands.length} of ${need.length} needing a link`);

  const list = LIMIT ? cands.slice(0, LIMIT) : cands;
  let verified = 0, rejected = 0;
  const ok = [];
  for (const [i, m] of list.entries()) {
    let page;
    try { page = (await axios.get(m.cand.url, { headers: { 'User-Agent': UA }, timeout: 25000 })).data; }
    catch (e) { console.log(`  ? #${m.meet_id} ${m.name.slice(0,34)} — fetch failed`); rejected++; await sleep(400); continue; }
    const text = cheerio.load(page)('body').text();
    const d = new Date(m.date);
    let dateOk = false;
    for (let off = -3; off <= 3 && !dateOk; off++) {
      const t = new Date(d); t.setDate(t.getDate() + off);
      const mon = t.toLocaleString('en-US', { month: 'long' });
      const mon3 = t.toLocaleString('en-US', { month: 'short' });
      const day = t.getDate();
      if (new RegExp(`(${mon}|${mon3})\\.?\\s+0?${day}\\b`, 'i').test(text)) dateOk = true;
    }
    if (dateOk) { ok.push(m); verified++; if (verified <= 12) console.log(`  OK   #${m.meet_id} ${m.date} ${m.name.slice(0,40)}  ->  ${m.cand.url}`); }
    else { rejected++; if (rejected <= 6) console.log(`  DATE #${m.meet_id} ${m.date} ${m.name.slice(0,40)} — page date does not match`); }
    await sleep(400);
  }
  console.log(`\nverified ${verified} | rejected ${rejected}`);
  if (!APPLY) { console.log('(report only — pass --apply to store tfrrs_url)'); await c.end(); return; }

  require('fs').writeFileSync(require('path').join(__dirname,
    `match-tfrrs-index-${new Date().toISOString().replace(/[:.]/g,'-')}.json`),
    JSON.stringify(ok.map(o => ({ meet_id: o.meet_id, name: o.name, date: o.date, url: o.cand.url })), null, 1));
  let n = 0;
  for (const m of ok) {
    const r = await c.query(`UPDATE meets SET tfrrs_url = $1 WHERE meet_id = $2 AND tfrrs_url IS NULL`, [m.cand.url, m.meet_id]);
    n += r.rowCount;
  }
  console.log(`stored tfrrs_url on ${n} meets`);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
