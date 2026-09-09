#!/usr/bin/env node

const path = require('node:path');
const { spawn } = require('node:child_process');
const { createClient } = require('@supabase/supabase-js');
const { isAthleticLiveUrl } = require('../athletic-net/athletic_live_host');

const SCRAPERS_ROOT = path.resolve(__dirname, '..');

function positiveInteger(value, name) {
  if (!/^[1-9]\d*$/.test(String(value || ''))) throw new Error(`${name} requires a positive whole number`);
  return Number(value);
}

function parseArgs(args = process.argv.slice(2)) {
  const valueAfter = flag => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  return {
    commit: args.includes('--commit'),
    days: positiveInteger(valueAfter('--days') || '7', '--days'),
    meetId: valueAfter('--meet') ? positiveInteger(valueAfter('--meet'), '--meet') : null,
    limit: valueAfter('--limit') ? positiveInteger(valueAfter('--limit'), '--limit') : null,
  };
}

function athleticSourceUrl(meet) {
  if (meet.athletic_net_results_url) return meet.athletic_net_results_url;
  return isAthleticLiveUrl(meet.meet_url) ? meet.meet_url : null;
}

function availableSourceJobs(meet) {
  const jobs = [];
  if (meet.tfrrs_url) jobs.push({ source: 'tfrrs', url: meet.tfrrs_url });
  const athleticUrl = athleticSourceUrl(meet);
  if (athleticUrl) jobs.push({ source: 'athletic_net', url: athleticUrl });
  return jobs;
}

function sourceCommand(job, meet, { commit = false } = {}) {
  if (job.source === 'tfrrs') {
    return {
      script: path.join(SCRAPERS_ROOT, 'tfrrs/meet-scraper/sync-weekend-results.js'),
      args: [
        '--meet', String(meet.meet_id), '--source-url', job.url,
        '--compare', '--control-plane', commit ? '--commit' : '--scrape'
      ]
    };
  }
  if (job.source === 'athletic_net') {
    return {
      script: path.join(SCRAPERS_ROOT, 'athletic-net/import_meet_results.js'),
      args: [
        String(meet.meet_id), '--source-url', job.url, '--control-plane',
        ...(commit ? ['--commit'] : [])
      ]
    };
  }
  throw new Error(`Unsupported result source: ${job.source}`);
}

function runSourceProcess(job, meet, options = {}) {
  const command = sourceCommand(job, meet, options);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [command.script, ...command.args], {
      cwd: SCRAPERS_ROOT,
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.once('error', reject);
    child.once('close', code => resolve({ source: job.source, code }));
  });
}

async function syncMeet(meet, { commit = false, runSource = runSourceProcess } = {}) {
  const jobs = availableSourceJobs(meet);
  const outcomes = [];
  // TFRRS runs first because it anchors the existing collegiate identity graph. Athletic.net then
  // adds its unique results and links matching observations to the same canonical performances.
  for (const job of jobs) {
    try {
      outcomes.push(await runSource(job, meet, { commit }));
    } catch (error) {
      outcomes.push({ source: job.source, code: 1, error: error?.message || String(error) });
    }
  }
  return { meetId: Number(meet.meet_id), jobs: jobs.length, outcomes };
}

async function loadMeets({ meetId, days, limit }, env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  let query = client
    .from('meets')
    .select('meet_id,name,date,end_date,status,meet_url,tfrrs_url,athletic_net_results_url')
    .order('date', { ascending: false })
    .order('meet_id', { ascending: true });

  if (meetId) query = query.eq('meet_id', meetId);
  else {
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    query = query.gte('date', start.toISOString().slice(0, 10)).lte('date', end.toISOString().slice(0, 10));
  }
  const { data, error } = await query;
  if (error) throw error;
  const eligible = (data || []).filter(meet =>
    meet.status !== 'upcoming' && availableSourceJobs(meet).length > 0
  );
  return limit ? eligible.slice(0, limit) : eligible;
}

async function main() {
  const options = parseArgs();
  if (!process.env.INGEST_DATABASE_URL) throw new Error('INGEST_DATABASE_URL is required');
  const meets = await loadMeets(options);
  console.log(`DUAL-SOURCE ${options.commit ? 'COMMIT' : 'DRY RUN'}: ${meets.length} meets`);
  let failed = 0;
  for (const [index, meet] of meets.entries()) {
    console.log(`\n[${index + 1}/${meets.length}] ${meet.meet_id} ${meet.name}`);
    const result = await syncMeet(meet, options);
    failed += result.outcomes.filter(outcome => outcome.code !== 0).length;
  }
  if (failed) {
    console.error(`\nCompleted with ${failed} source run(s) requiring attention.`);
    process.exitCode = 1;
  }
}

module.exports = {
  athleticSourceUrl,
  availableSourceJobs,
  loadMeets,
  parseArgs,
  runSourceProcess,
  sourceCommand,
  syncMeet,
};

if (require.main === module) {
  main().catch(error => {
    console.error('FATAL:', error?.stack || error);
    process.exit(1);
  });
}
