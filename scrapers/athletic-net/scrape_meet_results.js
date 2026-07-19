#!/usr/bin/env node
/**
 * athletic.net meet-results scraper (structured HTML, not PDF).
 *
 * WHY THIS EXISTS: platforms/athletic_net.js is stale — it looks for `a[href*="/event/"]` and
 * `<tr>` table rows. athletic.net's current results pages have NEITHER (event links are
 * `/results/{m|f}/{div}/{event}` and rows are `div.result-row`), so it silently returns 0 events.
 * That's why athletic.net data never landed. This scraper targets the real, current DOM.
 *
 * Flow (per meet):
 *   1. live.athletic.net/meets/{liveId}  --("View on AthleticNET")-->  www meet id   [resolveWwwMeetId]
 *   2. /TrackAndField/meet/{id}/results  -->  event links               [getEventLinks]
 *   3. each event page                   -->  div.result-row parsed     [scrapeEvent]
 *
 * Cloudflare: athletic.net is protected — plain HTTP gets a 403 challenge. We use
 * puppeteer-extra + StealthPlugin (already proven against athletic.net/USTFCCCA here).
 * Requires Node 20+ (undici/puppeteer).
 *
 * Usage:
 *   node scrape_meet_results.js https://www.athletic.net/TrackAndField/meet/631684/results
 *   node scrape_meet_results.js https://live.athletic.net/meets/63156      # resolves to www first
 *   node scrape_meet_results.js 631684 --out results.json --limit 3
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const delay = ms => new Promise(r => setTimeout(r, ms));

class AthleticNetMeetScraper {
  constructor(opts = {}) {
    this.headless = opts.headless !== false;
    this.timeout = opts.timeout || 60000;
    this.settle = opts.settle || 3500; // Angular render time
    this.browser = null;
    this.page = null;
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: this.headless ? 'new' : false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1400, height: 1000 });
  }

  async close() {
    if (this.browser) { await this.browser.close(); this.browser = null; this.page = null; }
  }

  async _goto(url) {
    await this.page.goto(url, { waitUntil: 'networkidle2', timeout: this.timeout });
    await delay(this.settle);
  }

  /** live.athletic.net/meets/{id} -> the permanent www.athletic.net meet id (via "View on AthleticNET"). */
  async resolveWwwMeetId(liveUrl) {
    await this._goto(liveUrl);
    const href = await this.page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a[href]'))
        .find(x => /athletic\.net\/TrackAndField\/meet\/\d+/i.test(x.getAttribute('href') || ''));
      return a ? a.getAttribute('href') : null;
    });
    const m = href && href.match(/\/meet\/(\d+)/);
    return m ? m[1] : null;
  }

  /** All event-results links for a meet: /TrackAndField/meet/{id}/results/{m|f}/{divId}/{eventCode} */
  async getEventLinks(meetId) {
    await this._goto(`https://www.athletic.net/TrackAndField/meet/${meetId}/results`);
    return this.page.evaluate(() => {
      const seen = new Map();
      document.querySelectorAll('a[href*="/results/"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const m = href.match(/\/meet\/(\d+)\/results\/(m|f)\/([^/]+)\/([^/?#]+)/i);
        if (!m) return;
        const url = href.startsWith('http') ? href : `https://www.athletic.net${href}`;
        if (!seen.has(url)) {
          seen.set(url, { url, gender: m[2], divId: m[3], eventCode: decodeURIComponent(m[4]), divLabel: a.textContent.trim() });
        }
      });
      return [...seen.values()];
    });
  }

  /** Parse one event's results page (div.result-row layout). */
  async scrapeEvent(ev) {
    await this._goto(ev.url);
    const parsed = await this.page.evaluate(() => {
      const txt = el => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
      const rows = Array.from(document.querySelectorAll('.result-row'));
      return {
        pageTitle: document.title,
        results: rows.map(row => {
          const nameEl = row.querySelector('.title.text-overflow-ellipsis');
          const teamEl = row.querySelector('.subtitle.team');
          // NOTE: query the ROW for these — the name element's first <a> is the avatar
          // (/profile/{handle}), not the athlete link, so scoping to nameEl grabs the wrong one.
          const aHref = row.querySelector('a[href*="/athlete/"]')?.getAttribute('href') || '';
          const tHref = row.querySelector('a[href*="/team/"]')?.getAttribute('href') || '';
          const pHref = row.querySelector('a[href*="/profile/"]')?.getAttribute('href') || '';
          const tertiary = txt(row.querySelector('.tertiary-content')) || '';
          return {
            place: txt(row.querySelector('.place-column')),
            athlete_name: txt(nameEl),
            athletic_net_athlete_id: (aHref.match(/\/athlete\/(\d+)/) || [])[1] || null,
            athletic_net_profile: (pHref.match(/\/profile\/([^/?#]+)/) || [])[1] || null,
            team_name: txt(teamEl),
            athletic_net_team_id: (tHref.match(/\/team\/(\d+)/) || [])[1] || null,
            mark_raw: txt(row.querySelector('.secondary .title')),
            // tertiary carries: "SB • Yr: Sr • +10pts • 4.0m/s"
            wind: (tertiary.match(/([+-]?\d+(?:\.\d+)?)\s*m\/s/) || [])[1] || null,
            year_in_school: (tertiary.match(/Yr:\s*([A-Za-z]+)/) || [])[1] || null,
            points: (tertiary.match(/([+-]?\d+)\s*pts/) || [])[1] || null,
            is_sb: /\bSB\b/.test(tertiary),
            is_pr: /\bPR\b/.test(tertiary),
            tertiary_raw: tertiary || null,
          };
        }),
      };
    });
    return { ...ev, page_title: parsed.pageTitle, result_count: parsed.results.length, results: parsed.results };
  }

  /** Scrape every event of a meet. Accepts a www URL/id or a live.athletic.net URL. */
  async scrapeMeet(target, { limit = 0 } = {}) {
    if (!this.browser) await this.init();
    let meetId = null;

    if (/^\d+$/.test(String(target))) meetId = String(target);
    else if (/athletic\.net\/TrackAndField\/meet\/(\d+)/i.test(target)) meetId = target.match(/\/meet\/(\d+)/)[1];
    // Any AthleticLIVE live page (live.athletic.net, *.anet.live, live.herostiming.com, etc.) uses
    // the /meets/{id} path — resolve it to the permanent www meet id via "View on AthleticNET".
    else if (/\/meets\/\d+/i.test(target) || /anet\.live|live\.athletic\.net/i.test(target)) {
      console.log(`Resolving live URL -> www meet id: ${target}`);
      meetId = await this.resolveWwwMeetId(target);
      if (!meetId) throw new Error(`Could not resolve a www.athletic.net meet id from ${target}`);
      console.log(`  -> athletic.net meet ${meetId}`);
    } else throw new Error(`Unrecognized meet target: ${target}`);

    let events = await this.getEventLinks(meetId);
    console.log(`Meet ${meetId}: found ${events.length} event-result links`);
    if (limit) events = events.slice(0, limit);

    const out = { meet_id_athletic_net: meetId, scraped_at: new Date().toISOString(), events: [] };
    for (const ev of events) {
      try {
        const r = await this.scrapeEvent(ev);
        console.log(`  ${r.gender}/${r.divId}/${r.eventCode}: ${r.result_count} results`);
        out.events.push(r);
      } catch (e) {
        console.log(`  ${ev.eventCode}: ERROR ${e.message}`);
        out.events.push({ ...ev, error: e.message, results: [] });
      }
      await delay(400); // be polite
    }
    out.total_results = out.events.reduce((s, e) => s + (e.results?.length || 0), 0);
    return out;
  }
}

module.exports = { AthleticNetMeetScraper };

if (require.main === module) {
  const args = process.argv.slice(2);
  const target = args[0];
  const outIdx = args.indexOf('--out');
  const limIdx = args.indexOf('--limit');
  const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
  const limit = limIdx >= 0 ? parseInt(args[limIdx + 1], 10) : 0;

  if (!target) {
    console.log('Usage: node scrape_meet_results.js <meetId | www meet url | live.athletic.net url> [--limit N] [--out file.json]');
    process.exit(1);
  }

  (async () => {
    const s = new AthleticNetMeetScraper();
    try {
      const data = await s.scrapeMeet(target, { limit });
      console.log('\n' + '='.repeat(60));
      console.log(`Events: ${data.events.length} | Total results: ${data.total_results}`);
      const first = data.events.find(e => e.results?.length);
      if (first) {
        console.log(`\nSample (${first.eventCode}):`);
        first.results.slice(0, 3).forEach(r =>
          console.log(`  ${r.place}. ${r.athlete_name} (anet:${r.athletic_net_athlete_id}) | ${r.team_name} | ${r.mark_raw} | wind=${r.wind} yr=${r.year_in_school}`));
      }
      if (outFile) { fs.writeFileSync(outFile, JSON.stringify(data, null, 2)); console.log(`\nSaved -> ${outFile}`); }
    } catch (e) {
      console.error('ERROR', e.message);
      process.exitCode = 1;
    } finally {
      await s.close();
    }
  })();
}
