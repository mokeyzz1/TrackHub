#!/usr/bin/env node
/**
 * Fix Athlete Names - FAST version with concurrent updates
 */

const https = require('https');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL?.replace('https://', '') || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function supabaseRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/' + endpoint,
      method: method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject({ status: res.statusCode, message: body });
        } else {
          resolve({ status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function flipName(name) {
  const parts = name.split(',').map(p => p.trim());
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `${parts[1]} ${parts[0]}`;
  }
  return name;
}

async function fetchAthletesWithComma(offset, limit) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SUPABASE_URL,
      path: `/rest/v1/athletes?select=athlete_id,full_name&full_name=like.*,*&offset=${offset}&limit=${limit}`,
      method: 'GET',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function updateAthlete(athleteId, newName) {
  return supabaseRequest('PATCH', `athletes?athlete_id=eq.${athleteId}`, {
    full_name: newName
  });
}

async function main() {
  console.log('='.repeat(50));
  console.log('FIX ATHLETE NAMES - FAST VERSION');
  console.log('='.repeat(50));

  let offset = 0;
  const limit = 1000;
  let totalUpdated = 0;
  let totalErrors = 0;
  const concurrency = 50; // Process 50 at a time

  while (true) {
    const athletes = await fetchAthletesWithComma(offset, limit);
    
    if (!athletes || athletes.length === 0) break;

    // Process in batches of `concurrency`
    for (let i = 0; i < athletes.length; i += concurrency) {
      const batch = athletes.slice(i, i + concurrency);
      
      const promises = batch.map(async (athlete) => {
        const newName = flipName(athlete.full_name);
        if (newName !== athlete.full_name) {
          try {
            await updateAthlete(athlete.athlete_id, newName);
            return { success: true };
          } catch (e) {
            return { success: false };
          }
        }
        return { success: true, skipped: true };
      });

      const results = await Promise.all(promises);
      totalUpdated += results.filter(r => r.success && !r.skipped).length;
      totalErrors += results.filter(r => !r.success).length;
    }

    process.stdout.write(`\rProcessed: ${offset + athletes.length} | Updated: ${totalUpdated} | Errors: ${totalErrors}`);
    
    if (athletes.length < limit) break;
    offset += limit;
  }

  console.log('\n' + '='.repeat(50));
  console.log('COMPLETE!');
  console.log(`Total updated: ${totalUpdated}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
