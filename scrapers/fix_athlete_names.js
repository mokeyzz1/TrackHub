#!/usr/bin/env node
/**
 * Fix Athlete Names - Flip "Last, First" to "First Last"
 */

const https = require('https');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL?.replace('https://', '') || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Missing Supabase credentials');
  process.exit(1);
}

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
  // "Sparks, Frank" -> "Frank Sparks"
  // "Sparks , Frank" -> "Frank Sparks" (handle extra spaces)
  const parts = name.split(',').map(p => p.trim());
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `${parts[1]} ${parts[0]}`;
  }
  return name; // Return as-is if can't parse
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

async function main() {
  console.log('='.repeat(50));
  console.log('FIX ATHLETE NAMES - Flip "Last, First" to "First Last"');
  console.log('='.repeat(50));

  let offset = 0;
  const limit = 500;
  let totalUpdated = 0;
  let totalErrors = 0;

  while (true) {
    // Fetch batch of athletes with comma in name
    const athletes = await fetchAthletesWithComma(offset, limit);
    
    if (!athletes || athletes.length === 0) {
      break;
    }

    // Update each athlete
    for (const athlete of athletes) {
      const newName = flipName(athlete.full_name);
      
      if (newName !== athlete.full_name) {
        try {
          await supabaseRequest('PATCH', `athletes?athlete_id=eq.${athlete.athlete_id}`, {
            full_name: newName
          });
          totalUpdated++;
        } catch (e) {
          totalErrors++;
        }
      }
    }

    process.stdout.write(`\rProcessed: ${offset + athletes.length} | Updated: ${totalUpdated} | Errors: ${totalErrors}`);
    
    if (athletes.length < limit) {
      break;
    }
    
    offset += limit;
  }

  console.log('\n' + '='.repeat(50));
  console.log('COMPLETE!');
  console.log(`Total updated: ${totalUpdated}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
