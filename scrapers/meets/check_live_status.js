#!/usr/bin/env node
/**
 * Live Status Checker
 *
 * Lightweight script that updates meet statuses based on time.
 * Runs hourly on Fri/Sat/Sun to mark meets as 'live' or 'completed'.
 *
 * No external scraping - just checks time and updates database.
 */

const https = require('https');

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL || 'hunbahsnaeeztmzqpnrl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY required');
  process.exit(1);
}

// Meet hours (Central time)
const MEET_START_HOUR = 9;   // 9 AM - meets typically start
const MEET_END_HOUR = 23;    // 11 PM - meets can run late

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Supabase REST helper
function supabaseRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SUPABASE_URL.replace('https://', ''),
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

// Get current hour in Central time
function getCentralHour() {
  const now = new Date();
  // Convert to Central time (UTC-6 in winter, UTC-5 in summer)
  const centralOffset = -6; // Adjust for daylight saving if needed
  const centralTime = new Date(now.getTime() + (centralOffset * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
  return centralTime.getHours();
}

// Get today's date in YYYY-MM-DD format
function getToday() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

async function main() {
  log('='.repeat(50));
  log('LIVE STATUS CHECKER');
  log('='.repeat(50));

  const today = getToday();
  const currentHour = getCentralHour();

  log(`Today: ${today}`);
  log(`Current hour (Central): ${currentHour}`);

  try {
    // Get all meets happening today (including multi-day meets where today is between date and end_date)
    const res = await supabaseRequest('GET', `meets?date=lte.${today}&end_date=gte.${today}&select=meet_id,name,status,meet_url,date,end_date`);

    if (!res.data || res.data.length === 0) {
      log('No meets today');
      return;
    }

    log(`Found ${res.data.length} meets today`);

    let liveCount = 0;
    let completedCount = 0;
    let skippedCount = 0;

    for (const meet of res.data) {
      let newStatus = null;
      const meetEndDate = meet.end_date || meet.date;
      const isLastDay = (meetEndDate === today);

      if (currentHour >= MEET_START_HOUR && currentHour < MEET_END_HOUR) {
        // During meet hours - mark as live (if has timing URL)
        if (meet.meet_url && meet.status !== 'live') {
          newStatus = 'live';
        }
      } else if (currentHour >= MEET_END_HOUR && isLastDay) {
        // After meet hours on the LAST day - mark as completed
        if (meet.status !== 'completed') {
          newStatus = 'completed';
        }
      }

      if (newStatus) {
        await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, {
          status: newStatus,
          updated_at: new Date().toISOString()
        });

        if (newStatus === 'live') {
          log(`  LIVE: ${meet.name}`);
          liveCount++;
        } else {
          log(`  COMPLETED: ${meet.name}`);
          completedCount++;
        }
      } else {
        skippedCount++;
      }
    }

    log('');
    log('Summary:');
    log(`  Marked live: ${liveCount}`);
    log(`  Marked completed: ${completedCount}`);
    log(`  Skipped (no change): ${skippedCount}`);

  } catch (error) {
    log(`ERROR: ${error.message}`);
    process.exit(1);
  }

  log('='.repeat(50));
}

main();
