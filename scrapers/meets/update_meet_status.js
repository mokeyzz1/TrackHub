#!/usr/bin/env node
/**
 * Update Meet Status
 *
 * Owns upcoming/live/completed lifecycle transitions based on Central time. It never changes a
 * meet's date, end_date, source links, or result state.
 *
 * Logic:
 * - LIVE: the meet's date range contains today AND it has a live/timing URL
 * - COMPLETED: end_date < today, OR (end_date = today AND after 11 PM Central on last day)
 * - UPCOMING: date > today
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

// Meet end hour (Central time) - after this, last-day meets can be marked completed
const MEET_END_HOUR = 23; // 11 PM Central

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

function getCentralClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { today: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function dateOnly(value) {
  return value ? String(value).split('T')[0] : null;
}

function desiredMeetStatus(meet, { today, hour, endHour = MEET_END_HOUR }) {
  if (meet.status === 'cancelled') return 'cancelled';
  const start = dateOnly(meet.date);
  const end = dateOnly(meet.end_date) || start;
  if (!start) return meet.status || null;
  if (start > today) return 'upcoming';
  if (end < today || (end === today && hour >= endHour)) return 'completed';
  if (start <= today && end >= today && meet.meet_url) return 'live';
  return meet.status || 'upcoming';
}

function statusPatch(status, now = new Date()) {
  return { status, updated_at: now.toISOString() };
}

async function updateMeetStatuses() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase credentials.');
  const { today, hour: centralHour } = getCentralClock();
  const afterMeetHours = centralHour >= MEET_END_HOUR;

  log('='.repeat(50));
  log('UPDATE MEET STATUS');
  log(`Today: ${today}`);
  log(`Central hour: ${centralHour} (after meet hours: ${afterMeetHours})`);
  log('='.repeat(50));

  let liveCount = 0;
  let completedCount = 0;
  let upcomingCount = 0;

  // 1. Set LIVE: meets happening now (date <= today AND end_date >= today) with meet_url
  log('\n1. Checking meets that should be LIVE...');
  const { data: shouldBeLive } = await supabaseRequest('GET',
    `meets?select=meet_id,name,date,end_date,meet_url,status&or=(and(date.lte.${today},end_date.gte.${today}),and(date.eq.${today},end_date.is.null))&meet_url=not.is.null&status=in.(upcoming,completed)`
  );

  for (const meet of shouldBeLive || []) {
    if (desiredMeetStatus(meet, { today, hour: centralHour }) !== 'live') continue;
    await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, statusPatch('live'));
    log(`  -> LIVE: ${meet.name} (${dateOnly(meet.date)} to ${dateOnly(meet.end_date) || dateOnly(meet.date)})`);
    liveCount++;
  }

  // 2. Set COMPLETED: meets that have ended (end_date < today)
  log('\n2. Checking meets that should be COMPLETED (ended before today)...');
  const { data: endedMeets } = await supabaseRequest('GET',
    `meets?select=meet_id,name,date,end_date,meet_url,status&or=(end_date.lt.${today},and(end_date.is.null,date.lt.${today}))&status=in.(upcoming,live)`
  );

  for (const meet of endedMeets || []) {
    if (desiredMeetStatus(meet, { today, hour: centralHour }) !== 'completed') continue;
    await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, statusPatch('completed'));
    log(`  -> COMPLETED: ${meet.name}`);
    completedCount++;
  }

  // 3. Set COMPLETED: last-day meets after 11 PM Central
  if (afterMeetHours) {
    log('\n3. Checking last-day meets to mark COMPLETED (after 11 PM)...');
    const { data: lastDayMeets } = await supabaseRequest('GET',
      `meets?select=meet_id,name,date,end_date,meet_url,status&or=(end_date.eq.${today},and(end_date.is.null,date.eq.${today}))&status=eq.live`
    );

    for (const meet of lastDayMeets || []) {
      if (desiredMeetStatus(meet, { today, hour: centralHour }) !== 'completed') continue;
      await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, statusPatch('completed'));
      log(`  -> COMPLETED (end of last day): ${meet.name}`);
      completedCount++;
    }
  }

  // 4. Set UPCOMING: meets that haven't started (date > today)
  log('\n4. Checking meets that should be UPCOMING...');
  const { data: futureMeets } = await supabaseRequest('GET',
    `meets?select=meet_id,name,date,end_date,meet_url,status&date=gt.${today}&status=in.(live,completed)`
  );

  for (const meet of futureMeets || []) {
    if (desiredMeetStatus(meet, { today, hour: centralHour }) !== 'upcoming') continue;
    await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, statusPatch('upcoming'));
    log(`  -> UPCOMING: ${meet.name}`);
    upcomingCount++;
  }

  // Summary
  log('\n' + '='.repeat(50));
  log('SUMMARY');
  log(`  Live: ${liveCount} updated`);
  log(`  Completed: ${completedCount} updated`);
  log(`  Upcoming: ${upcomingCount} updated`);
  log('='.repeat(50));
}

if (require.main === module) {
  updateMeetStatuses().catch(err => {
    log(`ERROR: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { dateOnly, desiredMeetStatus, getCentralClock, statusPatch, updateMeetStatuses };
