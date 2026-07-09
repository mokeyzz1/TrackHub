#!/usr/bin/env node
/**
 * Job 1 of OVERNIGHT_BACKFILL_PLAN.md: fix stale/wrong `meets.meet_url` values.
 *
 * The old scoreLink heuristic (since removed) sometimes stored the wrong link on a
 * completed meet: an athletic.net meet hub with no /results, a registration page, or a
 * bare timing-vendor homepage. New meets self-heal on the next scrape; completed meets
 * outside the scrape window do not. This script fixes those in place.
 *
 * Remediation (plan Option 3, no re-scrape):
 *   - athletic.net hub  (.../meet/NNN)          -> rewrite to .../meet/NNN/results
 *   - athletic.net register (.../meet/NNN/register) -> null
 *   - bare vendor / other homepage (path is "/") -> null
 *
 * It re-runs detection every time, so it never trusts a stale list.
 *
 * Dry run (default, no writes):
 *   node fix_meet_urls.js
 * Apply:
 *   node fix_meet_urls.js --commit
 */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const COMMIT = process.argv.includes('--commit');

// Known timing-vendor hosts (used to distinguish a recognized vendor homepage).
const VENDOR_HOSTS = [
  'leonetiming.com', 'flashresults.com', 'pttiming.com', 'directathletics.com',
  'runnercard.com', 'trackscoreboard.com', 'finishtiming.com', 'deltatiming.com',
  'milesplit.com', 'athletic.net', 'tfrrs.org', 'sporttrax.com'
];

function parse(u) {
  try {
    const url = new URL(u);
    return { host: url.hostname.replace(/^www\./, ''), pathname: url.pathname, search: url.search };
  } catch {
    return null;
  }
}

/** Returns a category string, or null when the URL looks fine. Host-anchored to avoid
 *  false matches (e.g. sporttrax.com vs x.com). */
function categorize(url) {
  if (!url) return null;
  const p = parse(url);
  if (!p) return null;
  const { host, pathname, search } = p;

  if (/\/register(\/|$|\?)/i.test(url)) {
    return host === 'athletic.net' ? 'athletic_net_register' : 'register';
  }
  if (host === 'google.com' && /\/search/i.test(pathname)) return 'google_search';
  if (host === 'espn.com' || /\/watch(\/|$|\?)/i.test(pathname)) return 'broadcast';
  if (['facebook.com', 'instagram.com', 'youtube.com', 'youtu.be'].includes(host)) return 'social';
  if (/\/meet-history/i.test(pathname) && /series=/i.test(url)) return 'ustfccca_meet_history';
  if (host === 'athletic.net' && /\/meet\/\d+\/?$/i.test(pathname)) return 'athletic_net_hub';

  // A "/" path with a query string (e.g. results.leonetiming.com/?mid=NNN) is a real
  // results link, so only a query-less root path counts as a bare homepage.
  const isRoot = (pathname === '/' || pathname === '') && !search;
  if (isRoot && VENDOR_HOSTS.includes(host)) return 'bare_homepage';
  if (isRoot) return 'bare_homepage_other';

  return null;
}

/** Given the current meet_url and its category, returns the new value:
 *  a rewritten string, or null to clear the field. Returns undefined for no-op. */
function remediate(url, category) {
  switch (category) {
    case 'athletic_net_hub':
      return url.replace(/\/?$/, '/results');
    case 'athletic_net_register':
    case 'register':
    case 'bare_homepage':
    case 'bare_homepage_other':
    case 'google_search':
    case 'broadcast':
    case 'social':
    case 'ustfccca_meet_history':
      return null;
    default:
      return undefined;
  }
}

async function fetchMeetsWithUrl() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('meets')
      .select('meet_id,name,date,meet_url,tfrrs_url,athletic_net_results_url,wa_results_url')
      .not('meet_url', 'is', null)
      .order('date', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  console.log(COMMIT ? 'FIX MEET URLS (COMMIT)' : 'FIX MEET URLS (DRY RUN - no writes)');

  const rows = await fetchMeetsWithUrl();
  console.log(`Scanned ${rows.length} meets with a non-null meet_url\n`);

  const plan = [];
  const catCounts = {};
  for (const m of rows) {
    const category = categorize(m.meet_url);
    if (!category) continue;
    const next = remediate(m.meet_url, category);
    if (next === undefined) continue;
    catCounts[category] = (catCounts[category] || 0) + 1;
    plan.push({ meet: m, category, from: m.meet_url, to: next });
  }

  const rewrites = plan.filter(p => p.to !== null);
  const nulls = plan.filter(p => p.to === null);

  console.log('Planned changes by category:');
  for (const [cat, n] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${cat}`);
  }
  console.log(`\n  Rewrites (-> /results): ${rewrites.length}`);
  console.log(`  Nulls (junk cleared):   ${nulls.length}`);
  console.log(`  Total changes:          ${plan.length}\n`);

  let applied = 0, failed = 0;
  for (const p of plan) {
    const label = p.to === null ? 'NULL ' : 'REWRITE';
    console.log(`[${COMMIT ? label : 'DRY'}] ${p.meet.meet_id} "${p.meet.name}"`);
    console.log(`    from: ${p.from}`);
    console.log(`    to:   ${p.to === null ? '(null)' : p.to}`);

    if (COMMIT) {
      const { error } = await supabase
        .from('meets')
        .update({ meet_url: p.to, updated_at: new Date().toISOString() })
        .eq('meet_id', p.meet.meet_id);
      if (error) {
        failed++;
        console.log(`    ERROR: ${error.message}`);
      } else {
        applied++;
      }
    }
  }

  console.log('\nSUMMARY');
  console.log(`  Candidates changed: ${plan.length}`);
  console.log(`  Rewrites: ${rewrites.length}   Nulls: ${nulls.length}`);
  if (COMMIT) {
    console.log(`  Applied: ${applied}   Failed: ${failed}`);
  } else {
    console.log('  No changes made (dry run). Re-run with --commit to apply.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
