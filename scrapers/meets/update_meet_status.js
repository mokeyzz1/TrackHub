#!/usr/bin/env node
/**
 * Update Meet Status
 *
 * Updates the status field of all meets based on current date/time.
 * Handles multi-day meets correctly by using end_date.
 *
 * Logic:
 * - LIVE: date <= today AND end_date >= today AND has meet_url
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

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Missing Supabase credentials.');
  process.exit(1);
}

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

function getCentralTime() {
  const now = new Date();
  // Use America/Chicago for proper DST handling
  const centralStr = now.toLocaleString('en-US', { timeZone: 'America/Chicago' });
  return new Date(centralStr);
}

function getToday() {
  const central = getCentralTime();
  return `${central.getFullYear()}-${String(central.getMonth() + 1).padStart(2, '0')}-${String(central.getDate()).padStart(2, '0')}`;
}

function getCentralHour() {
  return getCentralTime().getHours();
}

async function updateMeetStatuses() {
  const today = getToday();
  const centralHour = getCentralHour();
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
    `meets?select=meet_id,name,date,end_date,status&date=lte.${today}&end_date=gte.${today}&meet_url=not.is.null&status=neq.live`
  );

  for (const meet of shouldBeLive || []) {
    const endDate = meet.end_date?.split('T')[0];
    const isLastDay = endDate === today;

    // Don't set to live if it's the last day and past meet hours
    if (isLastDay && afterMeetHours) {
      continue;
    }

    await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, {
      status: 'live',
      updated_at: new Date().toISOString()
    });
    log(`  -> LIVE: ${meet.name} (${meet.date.split('T')[0]} to ${endDate})`);
    liveCount++;
  }

  // 1b. WORKAROUND for old frontend: Update date to today for multi-day meets still live
  // Old frontend uses date=today for Live tab, so we shift the date forward
  log('\n1b. Updating date field for multi-day meets (old frontend fix)...');
  const { data: multiDayLive } = await supabaseRequest('GET',
    `meets?select=meet_id,name,date,end_date&date=lt.${today}&end_date=gte.${today}&meet_url=not.is.null`
  );

  for (const meet of multiDayLive || []) {
    const endDate = meet.end_date?.split('T')[0];
    const isLastDay = endDate === today;

    if (isLastDay && afterMeetHours) {
      continue;
    }

    await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, {
      date: today,
      updated_at: new Date().toISOString()
    });
    log(`  -> Updated date to ${today}: ${meet.name}`);
  }

  // 2. Set COMPLETED: meets that have ended (end_date < today)
  log('\n2. Checking meets that should be COMPLETED (ended before today)...');
  const { data: endedMeets } = await supabaseRequest('GET',
    `meets?select=meet_id,name,date,end_date,status&end_date=lt.${today}&status=neq.completed`
  );

  for (const meet of endedMeets || []) {
    await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, {
      status: 'completed',
      updated_at: new Date().toISOString()
    });
    log(`  -> COMPLETED: ${meet.name}`);
    completedCount++;
  }

  // 3. Set COMPLETED: last-day meets after 11 PM Central
  if (afterMeetHours) {
    log('\n3. Checking last-day meets to mark COMPLETED (after 11 PM)...');
    const { data: lastDayMeets } = await supabaseRequest('GET',
      `meets?select=meet_id,name,date,end_date,status&end_date=eq.${today}&status=eq.live`
    );

    for (const meet of lastDayMeets || []) {
      await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, {
        status: 'completed',
        updated_at: new Date().toISOString()
      });
      log(`  -> COMPLETED (end of last day): ${meet.name}`);
      completedCount++;
    }
  }

  // 4. Set UPCOMING: meets that haven't started (date > today)
  log('\n4. Checking meets that should be UPCOMING...');
  const { data: futureMeets } = await supabaseRequest('GET',
    `meets?select=meet_id,name,date,status&date=gt.${today}&status=neq.upcoming`
  );

  for (const meet of futureMeets || []) {
    await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, {
      status: 'upcoming',
      updated_at: new Date().toISOString()
    });
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

updateMeetStatuses().catch(err => {
  log(`ERROR: ${err.message}`);
  process.exit(1);
});
