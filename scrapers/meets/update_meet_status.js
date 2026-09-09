#!/usr/bin/env node
/**
 * Update Meet Status
 *
 * Synchronizes the legacy meets.status cache from the authoritative v_meets_lifecycle view. The
 * database contract owns date/time/override evaluation. This script never changes a meet's dates,
 * timezone, override, source links, or result state.
 *
 * Usage:
 *   node update_meet_status.js
 *
 * Runs via GitHub Action:
 * - Daily at 6 AM Central
 * - Hourly on Fri/Sat/Sun during meet hours
 */

const https = require('https');
const path = require('path');

// Load dotenv only for local development (not needed in GitHub Actions)
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch (e) {
  // dotenv not installed - running in CI, env vars passed directly
}

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace('https://', '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const LIFECYCLE_STATUSES = Object.freeze(['upcoming', 'live', 'completed', 'cancelled', 'postponed']);

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function supabaseRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/' + endpoint,
      method: method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = body ? JSON.parse(body) : {};
          if (res.statusCode >= 400) {
            reject({ status: res.statusCode, message: result.message || body });
          } else {
            resolve({ data: result, status: res.statusCode });
          }
        } catch (e) {
          resolve({ data: body, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function dateOnly(value) {
  return value ? String(value).split('T')[0] : null;
}

function lifecycleMismatchEndpoint(status, limit = 500) {
  if (!LIFECYCLE_STATUSES.includes(status)) throw new Error(`Unsupported lifecycle status: ${status}`);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('limit must be between 1 and 1000');
  return 'v_meets_lifecycle?select=meet_id,name,date,end_date,status,effective_status'
    + `&effective_status=eq.${status}&status=neq.${status}`
    + `&order=meet_id.asc&limit=${limit}`;
}

function statusPatch(status, now = new Date()) {
  return { status, updated_at: now.toISOString() };
}

async function updateMeetStatuses() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase credentials.');

  log('='.repeat(50));
  log('SYNCHRONIZE MEET STATUS CACHE');
  log('='.repeat(50));

  const counts = Object.fromEntries(LIFECYCLE_STATUSES.map(status => [status, 0]));
  for (const status of LIFECYCLE_STATUSES) {
    while (true) {
      // Always fetch from the beginning: successfully patched rows leave the mismatch set. Using
      // an increasing offset here would skip rows as that set shrinks.
      const { data: rows } = await supabaseRequest('GET', lifecycleMismatchEndpoint(status));
      for (const meet of rows || []) {
        await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, statusPatch(status));
        log(`  -> ${status.toUpperCase()}: ${meet.name} (${dateOnly(meet.date)} to ${dateOnly(meet.end_date)})`);
        counts[status]++;
      }
      if (!rows || rows.length < 500) break;
    }
  }

  // Summary
  log('\n' + '='.repeat(50));
  log('SUMMARY');
  for (const status of LIFECYCLE_STATUSES) log(`  ${status}: ${counts[status]} updated`);
  log('='.repeat(50));
}

if (require.main === module) {
  updateMeetStatuses().catch(err => {
    log(`ERROR: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { LIFECYCLE_STATUSES, dateOnly, lifecycleMismatchEndpoint, statusPatch, updateMeetStatuses };
