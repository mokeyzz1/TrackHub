#!/usr/bin/env node
/**
 * Crawl TFRRS's ENTIRE meet index and cache it locally.
 *
 * THE PROBLEM THIS SOLVES. ~300 meets have broken 4x100s, ~180 are empty, and none can be fixed
 * because they hold no results link. USTFCCCA's directory is a moving window (CLAUDE.md §1b), so
 * for old meets those links are gone. But TFRRS aggregates EVERY college meet (owner, repeatedly)
 * and its results_search is paginated ~1,000+ pages deep at 30 meets/page -- 30,000+ meets, versus
 * the 12,700 in our DB. The links are not gone; we just never had a way to look them up.
 *
 * So: crawl once, cache to tfrrs-meet-index.json, then match offline. Read-only, writes nothing
 * to the database.
 *
 * ⚠️ MATCHING IS A SEPARATE STEP AND MUST BE VERIFIED. Name matching is what caused DUP-1 (three
 * meets ended up holding Big Ten results). Nothing here writes a URL anywhere -- see
 * DATA_SOURCE_STRATEGY.md for the required checks: the candidate page's own date must contain the
 * meet's date, and its teams must fit the meet's identity.
 *
 *   node crawl-tfrrs-index.js [--pages N] [--out file.json]
 */
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const pi = process.argv.indexOf('--pages');
const MAX = pi >= 0 ? parseInt(process.argv[pi + 1], 10) : 1200;
const oi = process.argv.indexOf('--out');
const OUT = oi >= 0 ? process.argv[oi + 1] : path.join(__dirname, 'tfrrs-meet-index.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const seen = new Map();          // url -> { name, url }
  let emptyStreak = 0;
  for (let page = 1; page <= MAX; page++) {
    let $;
    try {
      const { data } = await axios.get(`https://www.tfrrs.org/results_search.html?page=${page}`,
        { headers: { 'User-Agent': UA }, timeout: 30000 });
      $ = cheerio.load(data);
    } catch (e) {
      console.log(`  page ${page}: ${e.message.slice(0, 40)} — retrying once`);
      await sleep(4000);
      try {
        const { data } = await axios.get(`https://www.tfrrs.org/results_search.html?page=${page}`,
          { headers: { 'User-Agent': UA }, timeout: 30000 });
        $ = cheerio.load(data);
      } catch (e2) { console.log(`  page ${page}: failed twice, skipping`); continue; }
    }
    let added = 0;
    $('a[href*="/results/"]').each((_, a) => {
      const name = $(a).text().trim();
      const href = $(a).attr('href') || '';
      if (name.length < 5) return;
      const m = href.match(/\/results\/(\d+)/);
      if (!m) return;
      const url = `https://www.tfrrs.org/results/${m[1]}`;
      if (!seen.has(url)) { seen.set(url, { tfrrs_id: m[1], name, url }); added++; }
    });
    if (added === 0) { emptyStreak++; if (emptyStreak >= 3) { console.log(`  no new meets for 3 pages — stopping at ${page}`); break; } }
    else emptyStreak = 0;
    if (page % 50 === 0) console.log(`  page ${page}: ${seen.size.toLocaleString()} unique meets so far`);
    await sleep(350);            // be polite
  }
  fs.writeFileSync(OUT, JSON.stringify([...seen.values()], null, 1));
  console.log(`\nDONE — ${seen.size.toLocaleString()} unique TFRRS meets cached to ${OUT}`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
