#!/usr/bin/env node
/**
 * Upload TFRRS results from a JSON file
 * Usage: node upload_tfrrs_json.js <json_file>
 */

const fs = require('fs');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace('https://', '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabasePost(endpoint, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/' + endpoint,
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Prefer': 'return=representation'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function parseTimeToSeconds(mark) {
  if (!mark || typeof mark !== 'string') return null;
  // Skip field marks
  if (mark.includes('m') || mark.includes('-')) return null;

  const parts = mark.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return parseFloat(mark);
}

async function upload(jsonFile) {
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

  console.log('Meet:', data.meet_name);
  console.log('URL:', data.meet_url);
  console.log('Events:', data.events.length);
  console.log('');

  let uploaded = 0;
  let errors = 0;

  for (const event of data.events) {
    const eventName = event.event_name || event.name;
    process.stdout.write(`  ${eventName}: `);

    for (const result of event.results || []) {
      try {
        const markSeconds = parseTimeToSeconds(result.mark);

        await supabasePost('live_results', {
          meet_url: data.meet_url,
          meet_name: data.meet_name,
          event_name: eventName,
          participant_name: result.athlete_name,
          team_name: result.team_name,
          place: result.place,
          mark_raw: result.mark,
          mark_seconds: markSeconds,
          athlete_id: result.athlete_id || null,
          scraped_at: data.scraped_at || new Date().toISOString(),
          date: data.meet_date ? new Date(data.meet_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          round: 'FINAL',
          result_type: 'final',
          is_final: true
        });
        uploaded++;
        process.stdout.write('.');
      } catch (e) {
        errors++;
        process.stdout.write('x');
      }
    }
    console.log(` ${event.results?.length || 0}`);
  }

  console.log('\n' + '='.repeat(40));
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Errors: ${errors}`);
  console.log(`Matched athletes: ${data.stats?.matched_athletes || 'N/A'}`);
}

// CLI
const jsonFile = process.argv[2];
if (!jsonFile) {
  console.log('Usage: node upload_tfrrs_json.js <json_file>');
  process.exit(1);
}

upload(jsonFile).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
