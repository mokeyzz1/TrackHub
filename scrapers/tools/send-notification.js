#!/usr/bin/env node
/**
 * Send Push Notification to all TrackHub users
 *
 * Usage:
 *   node send-notification.js "Message here"
 *   node send-notification.js "Message here" --title "Custom Title"
 *   node send-notification.js "🔥 John Doe just ran 9.95 in the 100m!"
 */

const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL?.replace('https://', '') || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Missing Supabase credentials. Check your .env file.');
  process.exit(1);
}

// Parse command line args
function parseArgs() {
  const args = process.argv.slice(2);
  let message = '';
  let title = 'TrackHub';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      title = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      message = args[i];
    }
  }

  return { message, title };
}

// Fetch all active push tokens from Supabase
function fetchPushTokens() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/push_tokens?is_active=eq.true&select=expo_push_token',
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const tokens = JSON.parse(body);
          resolve(tokens.map(t => t.expo_push_token));
        } catch (e) {
          reject(new Error('Failed to parse tokens: ' + body));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Send notifications via Expo Push API
function sendNotifications(tokens, title, body) {
  return new Promise((resolve, reject) => {
    // Build messages array (Expo accepts up to 100 per request)
    const messages = tokens.map(token => ({
      to: token,
      sound: 'default',
      title: title,
      body: body,
      data: { type: 'manual' },
    }));

    const postData = JSON.stringify(messages);

    const options = {
      hostname: 'exp.host',
      path: '/--/api/v2/push/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch (e) {
          resolve({ raw: body });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  const { message, title } = parseArgs();

  if (!message) {
    console.log('Usage: node send-notification.js "Your message here"');
    console.log('       node send-notification.js "Message" --title "Custom Title"');
    console.log('');
    console.log('Example:');
    console.log('  node send-notification.js "🔥 John Doe just ran 9.95!"');
    process.exit(1);
  }

  console.log('='.repeat(50));
  console.log('SEND PUSH NOTIFICATION');
  console.log('='.repeat(50));
  console.log(`Title: ${title}`);
  console.log(`Message: ${message}`);
  console.log('');

  // Fetch tokens
  console.log('Fetching push tokens from Supabase...');
  const tokens = await fetchPushTokens();
  console.log(`Found ${tokens.length} active token(s)`);

  if (tokens.length === 0) {
    console.log('No tokens to send to. Exiting.');
    return;
  }

  // Send notifications
  console.log('Sending notifications via Expo Push API...');
  const result = await sendNotifications(tokens, title, message);

  console.log('');
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('');
  console.log('='.repeat(50));
  console.log(`DONE - Sent to ${tokens.length} device(s)`);
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
