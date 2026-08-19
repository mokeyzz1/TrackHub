#!/usr/bin/env node
/**
 * Recover TFRRS links for the 2025-26 meets that still have no results.
 *
 * WHY THIS EXISTS ALONGSIDE `match-tfrrs-index.js`. That script requires an EXACT normalised name
 * match against the cached index, which is why it left these 142 behind. But TFRRS routinely
 * publishes a longer name than we store: our "Big 12 Outdoor Championships" is its "Big 12
 * Outdoor Track & Field Championships". Exact matching cannot see that, and it is a real,
 * verifiable link to a major DI championship holding 0 results.
 *
 * So this widens the CANDIDATE GENERATOR (every discriminating token of the shorter name must
 * appear in the longer) while keeping verification exactly as strict:
 *
 *   GATE 1 — discriminating tokens must agree. "big west" != "big ten". This is the DUP-1 failure.
 *   GATE 2 — the candidate PAGE's own printed date must contain our meet's date (+/-3 days),
 *            fetched from TFRRS, not inferred.
 *   GATE 3 — the page must actually hold result rows.
 *
 * A candidate failing any gate is reported and never written. Fuzzy matching is sanctioned for old
 * meets ONLY with review before commit (OWNER_DECISIONS.md); the gates are that review, made
 * mechanical.
 *
 * WHY TFRRS AND NOT THE TIMING LINKS. These 142 meets sit behind 37 different timing companies
 * (milesplit.live 27, trackscoreboard 15, blacksquirrel 6, then a long one-off tail). That is 37
 * scrapers. TFRRS aggregates all college meets into the one format we already parse.
 *
 *   node match-2526-unlinked.js            # generate candidates, verify, report — writes nothing
 *   node match-2526-unlinked.js --apply    # store tfrrs_url for candidates that clear all gates
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Words that appear in hundreds of meet names and so carry no identifying power. Matching on
// these is how "Big West" gets confused with "Big Ten".
//
// ⚠️ WHAT IS *NOT* IN HERE MATTERS MORE THAN WHAT IS. A first draft listed indoor/outdoor/day/
// 1/2/prelims/multi as stopwords, and it duly matched "Appalachian AAC OUTDOOR Championships" to
// "Appalachian AC INDOOR T&F Championships", "River States Outdoor" to "River States Indoor", and
// "Battle Road Twilight I" to "Battle Road Twilight Meet 2". Environment is a separate axis from
// event (CLAUDE.md 3) and day/round numbers separate real sessions, so every one of those words
// is a DISCRIMINATOR, not noise. Generic-but-discriminating beats short-and-wrong.
const STOP = new Set(['invitational','invite','open','classic','championships','championship',
  'meet','track','field','university','college','the','of','and','at','vs','collegiate']);

const norm = s => String(s || '').toLowerCase()
  .replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const tokens = s => new Set(norm(s).split(' ').filter(w => w && !STOP.has(w)));

(async () => {
  const idxRaw = require('./tfrrs-meet-index.json');
  const index = Array.isArray(idxRaw) ? idxRaw : (idxRaw.meets || Object.values(idxRaw));
  const indexed = index.map(m => ({ ...m, tok: tokens(m.name) }));

  const c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 300000 });
  await c.connect();

  const { rows: empties } = await c.query(`
    WITH s AS (
      SELECT m.meet_id, m.name, m.date, m.meet_url,
             (SELECT count(*) FROM results r WHERE r.meet_id = m.meet_id)::int AS n
      FROM meets m
      WHERE m.date >= '2025-08-01' AND m.date < '2026-08-01'
        AND m.results_status <> 'no_results_at_source')
    -- date::text, NOT date. node-postgres hands a DATE column back as a JS Date, and
    -- String(new Date(...)).slice(0,10) is "Thu Feb 19" — which Date.parse() reads as NaN, so
    -- every date comparison silently fails and NOTHING verifies. That bug rejected all 45
    -- candidates here, including several whose page date plainly matched.
    SELECT meet_id, name, date::text AS date, meet_url FROM s WHERE n = 0 ORDER BY date`);
  await c.end();

  // ---- candidate generation -------------------------------------------------------------
  // Ambiguity is fatal: if two index entries match equally well we cannot tell which is right,
  // so we drop the meet rather than guess. Guessing is what DUP-1 was.
  const hits = [];
  let ambiguous = 0;
  for (const m of empties) {
    const mt = tokens(m.name);
    if (!mt.size) continue;
    const matches = [];
    for (const cand of indexed) {
      if (!cand.tok.size) continue;
      let shared = 0;
      for (const t of mt) if (cand.tok.has(t)) shared++;
      // every discriminating token of the SHORTER name must be present in the longer one
      if (shared === Math.min(mt.size, cand.tok.size)) matches.push({ cand, shared });
    }
    if (!matches.length) continue;

    // ⚠️ MOST SPECIFIC WINS — never "shortest name wins". A first version preferred the candidate
    // with the fewest tokens, and so matched "Big 12 Outdoor Championships" (May) to the index's
    // "Big 12 Championships" instead of its "Big 12 OUTDOOR Track & Field Championships",
    // throwing away the one word that separates the May meet from the February one. It was then
    // correctly rejected on date — a right answer for a wrong reason, which loses a real link.
    const top = Math.max(...matches.map(x => x.shared));
    const bests = matches.filter(x => x.shared === top);
    const urls = new Set(bests.map(x => x.cand.url));
    if (urls.size > 1) { ambiguous++; continue; }   // equally specific rivals: refuse to guess
    const best = bests[0].cand;
    hits.push({ ...m, cand_name: best.name, cand_url: best.url });
  }

  console.log(`2025-26 meets with no results: ${empties.length}`);
  console.log(`  single unambiguous index candidate: ${hits.length}`);
  console.log(`  ambiguous (>1 equally good) — skipped: ${ambiguous}`);
  console.log(`  no candidate in the index at all:      ${empties.length - hits.length - ambiguous}`);

  // ---- GATE 2/3: verify each candidate against the live TFRRS page --------------------------
  const MONTHS = ['january','february','march','april','may','june','july','august','september',
                  'october','november','december'];
  const within = (a, b, days) => Math.abs((a - b) / 86400000) <= days;

  const verified = [], rejected = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    try {
      const { data } = await axios.get(h.cand_url, { headers: { 'User-Agent': UA }, timeout: 30000 });
      const $ = cheerio.load(data);
      const body = $('body').text().replace(/\s+/g, ' ');
      const rows = $('table tbody tr').length;

      // TFRRS prints "May 14-16, 2026" or "March 7, 2026" — expand a range into its endpoints.
      const found = [];
      const re = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?,\s*(20\d\d)/gi;
      let mm;
      while ((mm = re.exec(body))) {
        const mo = MONTHS.indexOf(mm[1].toLowerCase());
        const y = +mm[4];
        found.push(Date.UTC(y, mo, +mm[2]));
        if (mm[3]) found.push(Date.UTC(y, mo, +mm[3]));
      }
      const ours = Date.parse(String(h.date).slice(0, 10) + 'T00:00:00Z');
      const dateOk = found.some(f => within(f, ours, 3));

      if (!found.length)      rejected.push({ ...h, why: 'no date printed on candidate page' });
      else if (!dateOk)       rejected.push({ ...h, why: `page dates ${found.map(f=>new Date(f).toISOString().slice(0,10)).join('/')} vs meet ${String(h.date).slice(0,10)}` });
      else if (rows === 0)    rejected.push({ ...h, why: 'candidate page holds no result rows' });
      else                    verified.push({ ...h, page_rows: rows });
    } catch (e) {
      rejected.push({ ...h, why: `fetch failed: ${e.message}` });
    }
    await sleep(1200);   // be polite to TFRRS
    if ((i + 1) % 10 === 0) console.log(`  ...verified ${i + 1}/${hits.length}`);
  }

  // ---- GATE 4: one results page may belong to ONE meet ---------------------------------------
  // THIS IS DUP-1. If two meet rows both point at the same TFRRS page, importing it twice puts
  // the identical performances on two different meets, which is precisely the bug the owner found
  // by noticing an athlete listed at a meet she never attended. Two rows matching one page usually
  // means our `meets` table split a multi-day meet (e.g. "Ron Kamaka Open" on Feb 19 AND Feb 21
  // against one page dated Feb 19-21) — a modelling problem to resolve deliberately, never by
  // importing the page twice and hoping.
  const claims = new Map();
  verified.forEach(v => { if (!claims.has(v.cand_url)) claims.set(v.cand_url, []); claims.get(v.cand_url).push(v); });
  const contested = [...claims.values()].filter(v => v.length > 1);
  const sole = verified.filter(v => claims.get(v.cand_url).length === 1);
  if (contested.length) {
    console.log(`\nHELD BACK — one page claimed by several meets (would recreate DUP-1): ${contested.flat().length} meets`);
    contested.forEach(g => {
      console.log(`  ${g[0].cand_url}  (${g[0].cand_name})`);
      g.forEach(v => console.log(`     #${v.meet_id}  ${String(v.date).slice(0,10)}  ${v.name}`));
    });
  }
  verified.length = 0; verified.push(...sole);

  console.log(`\nVERIFIED (date on the page matches, page has results): ${verified.length}`);
  verified.forEach(v => console.log(`  ${String(v.date).slice(0,10)}  #${v.meet_id}  ${v.name}\n              -> ${v.cand_name}  ${v.cand_url}  (${v.page_rows} rows)`));
  console.log(`\nREJECTED BY A GATE: ${rejected.length}`);
  rejected.forEach(r => console.log(`  #${r.meet_id}  ${r.name}  --  ${r.why}`));

  const out = path.join(__dirname, 'unlinked-2526-candidates.json');
  require('fs').writeFileSync(out, JSON.stringify(
    { generated: new Date().toISOString(), empties, verified, rejected }, null, 2));
  console.log(`\nwrote ${path.basename(out)}`);

  if (!APPLY) { console.log('\n(report only — pass --apply to store the verified tfrrs_urls)'); return; }

  const c2 = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 300000 });
  await c2.connect();
  let wrote = 0;
  for (const v of verified) {
    // never overwrite a link that already exists — only fill a genuine gap
    const r = await c2.query(
      `UPDATE meets SET tfrrs_url = $2, results_status = 'pending'
       WHERE meet_id = $1 AND tfrrs_url IS NULL RETURNING meet_id`, [v.meet_id, v.cand_url]);
    wrote += r.rowCount;
  }
  await c2.end();
  console.log(`\nstored tfrrs_url on ${wrote} meets — now run the TFRRS meet scraper against them`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
