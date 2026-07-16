#!/usr/bin/env node
/**
 * Backfill final result links for existing past meets.
 *
 * Dry run:
 *   node backfill_result_links.js --source ustfccca --limit 20
 *   node backfill_result_links.js --source tfrrs --since 2026-04-01 --until 2026-05-09 --limit 20
 *
 * Apply:
 *   node backfill_result_links.js --source all --since 2026-04-01 --until 2026-05-24 --commit
 */

const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function parseArgs() {
  const args = process.argv.slice(2);
  const valueAfter = (flag, fallback) => {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };

  return {
    commit: args.includes('--commit'),
    source: valueAfter('--source', 'all'),
    since: valueAfter('--since', '2026-04-01'),
    until: valueAfter('--until', new Date().toISOString().split('T')[0]),
    limit: Number(valueAfter('--limit', '0')) || 0
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeMeetName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s*\[[^\]]+\]/g, '')
    .replace(/\s*\(outdoor\)\s*/g, ' ')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Generic words that bloat meet names differently across sources (DB vs TFRRS) but carry no
// identity. Stripping them lets "MIAC Outdoor Championships" match "2026 MIAC Outdoor Track &
// Field Championships". Distinctive words (school/conference/meet-name tokens) are kept.
const NAME_STOPWORDS = new Set([
  'track', 'field', 'and', 'the', 'of', 'at', 'championship', 'championships',
  'outdoor', 'indoor', 'meet', 'presented', 'by'
]);

// Distinctive token set for a meet name (noise + years removed).
function nameTokens(name) {
  return new Set(
    normalizeMeetName(name)
      .split(' ')
      .filter(t => t && !NAME_STOPWORDS.has(t) && !/^(19|20)\d{2}$/.test(t))
  );
}

function tokenOverlap(a, b) {
  if (a.size === 0 || b.size === 0) return { equal: false, subset: false, jaccard: 0, smallLen: 0 };
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const union = new Set([...a, ...b]).size;
  const small = a.size <= b.size ? a : b;
  const smallLen = [...small].join('').length;
  return {
    equal: a.size === b.size && shared === a.size,
    subset: shared === Math.min(a.size, b.size),  // all of the smaller set is in the larger
    jaccard: shared / union,
    smallLen,
  };
}

function normalizeLocation(location) {
  return (location || '')
    .split('*')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

function rangeEnd(meet) {
  return meet.end_date || meet.date;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA;
}

// Date overlap with a tolerance (days). Multi-day meets list different single days across
// sources (TFRRS start vs DB last day), so allow a small slack while staying a real anchor.
function datesClose(dbMeet, sourceMeet, tolDays = 2) {
  if (!sourceMeet.date) return false;
  const ms = 86400000;
  const dbS = new Date(`${dbMeet.date}T00:00:00Z`).getTime();
  const dbE = new Date(`${rangeEnd(dbMeet)}T00:00:00Z`).getTime();
  const sS = new Date(`${sourceMeet.date}T00:00:00Z`).getTime();
  const sE = new Date(`${sourceMeet.end_date || sourceMeet.date}T00:00:00Z`).getTime();
  return dbS - tolDays * ms <= sE && sS <= dbE + tolDays * ms;
}

function parseUstfcccaDate(dateStr) {
  const year = new Date().getFullYear();
  const multi = dateStr.match(/\w+\s+(\w+)\s+(\d+)-\w+\s+(\w+)\s+(\d+)/);
  if (multi) {
    const [, startMonth, startDay, endMonth, endDay] = multi;
    return {
      start: new Date(`${startMonth} ${startDay}, ${year}`).toISOString().split('T')[0],
      end: new Date(`${endMonth} ${endDay}, ${year}`).toISOString().split('T')[0]
    };
  }

  const simpleMulti = dateStr.match(/(\w+)\s+(\d+)-(\d+)/);
  if (simpleMulti) {
    const [, month, startDay, endDay] = simpleMulti;
    return {
      start: new Date(`${month} ${startDay}, ${year}`).toISOString().split('T')[0],
      end: new Date(`${month} ${endDay}, ${year}`).toISOString().split('T')[0]
    };
  }

  const single = dateStr.match(/(\w+)\s+(\d+)/);
  if (single) {
    const [, month, day] = single;
    const date = new Date(`${month} ${day}, ${year}`).toISOString().split('T')[0];
    return { start: date, end: date };
  }

  return { start: null, end: null };
}

function parseTfrrsDate(dateStr) {
  const match = (dateStr || '').match(/(\d{2})\/(\d{2})(?:-\d{2})?(?:\/\d{2})?\/(\d{2})/);
  if (!match) return null;
  const year = parseInt(match[3], 10) >= 50 ? `19${match[3]}` : `20${match[3]}`;
  return `${year}-${match[1]}-${match[2]}`;
}

function matchScore(dbMeet, sourceMeet) {
  const dbLocation = normalizeLocation(dbMeet.location);
  const sourceLocation = normalizeLocation(sourceMeet.location);
  let score = 0;

  // Name: distinctive-token overlap (handles "MIAC Outdoor Championships" vs
  // "2026 MIAC Outdoor Track & Field Championships"). Require >=4 chars in the smaller token
  // set so a stray shared word can't carry a match — the exact date below is the real anchor.
  const ov = tokenOverlap(nameTokens(dbMeet.name), nameTokens(sourceMeet.name));
  if (ov.smallLen >= 4) {
    if (ov.equal) score += 80;
    else if (ov.subset) score += 70;
    else if (ov.jaccard >= 0.6) score += 55;
    else if (ov.jaccard >= 0.4) score += 35;
  }

  if (dbLocation && sourceLocation) {
    if (dbLocation === sourceLocation) score += 25;
    else if (dbLocation.includes(sourceLocation) || sourceLocation.includes(dbLocation)) score += 10;
  }

  // Date anchor — required for any confident match (no location on TFRRS rows). ±2 day slack.
  if (datesClose(dbMeet, sourceMeet, 2)) {
    score += 25;
  }

  return score;
}

function findDbMatch(dbMeets, sourceMeet) {
  const best = dbMeets
    .map(meet => ({ meet, score: matchScore(meet, sourceMeet) }))
    .filter(({ score }) => score >= 90)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.meet.meet_id - b.meet.meet_id;
    })[0];

  return best || null;
}

async function fetchMissingMeets(options) {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('meets')
      .select('meet_id,name,date,end_date,location,meet_url,timing_platform,tfrrs_url,athletic_net_results_url,wa_results_url,results_status')
      .gte('date', options.since)
      .lte('date', options.until)
      .neq('status', 'upcoming')
      .order('date', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  const candidates = [];
  for (const meet of rows) {
    const { count, error } = await supabase
      .from('results')
      .select('*', { head: true, count: 'exact' })
      .eq('meet_id', meet.meet_id);

    if (error) throw error;
    if ((count || 0) === 0) candidates.push(meet);
    if (options.limit && candidates.length >= options.limit) break;
  }

  return candidates;
}

async function fetchUstfcccaMeets(scopes = ['past', 'last_week']) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const all = [];

  for (const scope of scopes) {
    await page.goto(`https://web4.ustfccca.org/meets-results?datescope=${scope}`, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await sleep(2500);

    const meets = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('tbody tr')).map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) return null;

        const name = cells[0].querySelector('span[style*="font-weight:bold"]')?.textContent.trim();
        if (!name) return null;

        const location = cells[0].querySelector('span[style*="font-size:0.85em"]')?.textContent.trim() || '';
        const dateText = cells[1].querySelector('span[style*="font-size:0.85em"]')?.textContent.trim() || '';
        const links = Array.from(cells[2].querySelectorAll('a')).map(a => ({
          text: a.textContent.trim().toLowerCase(),
          href: a.href
        }));
        const byText = pattern => links.find(link => link.text.includes(pattern))?.href || null;

        return {
          name,
          location,
          dateText,
          timingUrl: byText('timing site'),
          tfrrsUrl: byText('tfrrs results'),
          athleticNetResultsUrl: byText('athleticnet final results') || byText('athletic.net final results'),
          waResultsUrl: byText('wa meet results')
        };
      }).filter(Boolean);
    });

    for (const meet of meets) {
      const parsedDate = parseUstfcccaDate(meet.dateText);
      all.push({
        ...meet,
        source: `ustfccca:${scope}`,
        date: parsedDate.start,
        end_date: parsedDate.end
      });
    }
  }

  await browser.close();
  return all;
}

async function fetchTfrrsMeets(options) {
  const start = new Date(options.since);
  const end = new Date(options.until);
  const all = [];
  let page = 1;
  let foundEarlier = false;

  while (!foundEarlier && page <= 100) {
    const response = await axios.get(`https://www.tfrrs.org/results_search.html?page=${page}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 30000
    });
    const $ = cheerio.load(response.data);
    let rowsOnPage = 0;

    $('table tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;
      rowsOnPage++;

      const dateText = $(cells[0]).text().trim();
      const date = parseTfrrsDate(dateText);
      if (!date) return;

      const dateObj = new Date(`${date}T00:00:00Z`);
      if (dateObj < start) {
        foundEarlier = true;
        return;
      }
      if (dateObj > end) return;

      const link = $(cells[1]).find('a').first();
      const name = link.text().trim();
      const href = link.attr('href');
      if (!name || !href) return;

      all.push({
        source: 'tfrrs',
        name,
        date,
        end_date: date,
        location: '',
        tfrrsUrl: href.startsWith('http') ? href : `https://www.tfrrs.org${href}`
      });
    });

    if (rowsOnPage === 0) break;
    console.log(`  TFRRS page ${page}: collected ${all.length} in range`);
    page++;
    await sleep(750);
  }

  return all;
}

function buildUpdates(dbMeet, sourceMeet) {
  const updates = {};
  if (sourceMeet.timingUrl && !dbMeet.meet_url) updates.meet_url = sourceMeet.timingUrl;
  if (sourceMeet.tfrrsUrl && !dbMeet.tfrrs_url) {
    updates.tfrrs_url = sourceMeet.tfrrsUrl;
    if (dbMeet.results_status !== 'imported') updates.results_status = 'tfrrs_available';
  }
  if (sourceMeet.athleticNetResultsUrl && !dbMeet.athletic_net_results_url) {
    updates.athletic_net_results_url = sourceMeet.athleticNetResultsUrl;
  }
  if (sourceMeet.waResultsUrl && !dbMeet.wa_results_url) {
    updates.wa_results_url = sourceMeet.waResultsUrl;
  }
  if (Object.keys(updates).length > 0) updates.updated_at = new Date().toISOString();
  return updates;
}

async function applyUpdates(meetId, updates) {
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase.from('meets').update(updates).eq('meet_id', meetId);
  if (error) throw error;
}

async function main() {
  const options = parseArgs();

  console.log(options.commit ? 'BACKFILL RESULT LINKS' : 'DRY RUN - BACKFILL RESULT LINKS');
  console.log(`Source: ${options.source}`);
  console.log(`Range: ${options.since} to ${options.until}`);
  if (options.limit) console.log(`Limit: ${options.limit}`);

  const dbMeets = await fetchMissingMeets(options);
  console.log(`DB missing-result candidates: ${dbMeets.length}`);

  let sourceMeets = [];
  if (options.source === 'all' || options.source === 'ustfccca') {
    const ustfcccaMeets = await fetchUstfcccaMeets();
    console.log(`USTFCCCA source rows: ${ustfcccaMeets.length}`);
    sourceMeets = sourceMeets.concat(ustfcccaMeets);
  }
  if (options.source === 'all' || options.source === 'tfrrs') {
    const tfrrsMeets = await fetchTfrrsMeets(options);
    console.log(`TFRRS source rows: ${tfrrsMeets.length}`);
    sourceMeets = sourceMeets.concat(tfrrsMeets);
  }

  let matched = 0;
  let updatesFound = 0;
  let updated = 0;
  const unmatched = [];

  for (let i = 0; i < sourceMeets.length; i++) {
    const sourceMeet = sourceMeets[i];
    const match = findDbMatch(dbMeets, sourceMeet);
    if (!match) continue;

    matched++;
    const updates = buildUpdates(match.meet, sourceMeet);
    if (Object.keys(updates).length === 0) continue;

    updatesFound++;
    console.log(`[${options.commit ? 'UPDATE' : 'DRY'}] ${match.meet.meet_id} ${match.meet.name} <= ${sourceMeet.source} ${sourceMeet.name} score=${match.score}`);
    console.log(`  ${JSON.stringify(updates)}`);

    if (options.commit) {
      await applyUpdates(match.meet.meet_id, updates);
      updated++;
    }

    if ((i + 1) % 25 === 0) {
      console.log(`Progress: scanned ${i + 1}/${sourceMeets.length}, matched ${matched}, updates ${updatesFound}`);
    }
  }

  for (const meet of dbMeets) {
    if (!sourceMeets.some(source => findDbMatch([meet], source))) {
      // record the best-scoring source for diagnosis (why did it miss?)
      let best = { score: 0, src: null };
      for (const s of sourceMeets) {
        const sc = matchScore(meet, s);
        if (sc > best.score) best = { score: sc, src: s };
      }
      unmatched.push({ meet, best });
    }
  }

  // Diagnostic: what do the unmatched near-misses look like? (top by best score)
  const nearMisses = unmatched.filter(u => u.best.score >= 55).sort((a, b) => b.best.score - a.best.score);
  console.log(`\nUNMATCHED near-misses (best score 55-89): ${nearMisses.length}`);
  nearMisses.slice(0, 20).forEach(u => {
    console.log(`  best=${u.best.score} "${u.meet.name}" (${u.meet.date}) ~ "${u.best.src?.name}" (${u.best.src?.date})`);
  });
  const noSignal = unmatched.filter(u => u.best.score < 55).length;
  console.log(`Unmatched with NO real signal (best <55, likely not in TFRRS window): ${noSignal}`);

  console.log('\nSUMMARY');
  console.log(`  Candidates: ${dbMeets.length}`);
  console.log(`  Source rows: ${sourceMeets.length}`);
  console.log(`  Matched source rows: ${matched}`);
  console.log(`  Meets with updates: ${updatesFound}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Still unmatched candidates: ${unmatched.length}`);
  console.log(options.commit ? '  Changes applied' : '  No changes made');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
