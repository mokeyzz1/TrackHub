const https = require('https');

const eventId = '2180795'; // Field event (Men Weight Throw)
const runningEventId = '2180753'; // Running event with splits (Men 1 Mile)
const meetId = '59182';

const endpoints = [
  { name: 'Results List (ind_res_list)', url: `https://athleticlive.blob.core.windows.net/\$web/ind_res_list/_doc/${eventId}` },
  { name: 'Entries List (ind_ent_list)', url: `https://athleticlive.blob.core.windows.net/\$web/ind_ent_list/_doc/${eventId}` },
  { name: 'Heat/Start List (ind_heat_list)', url: `https://athleticlive.blob.core.windows.net/\$web/ind_heat_list/_doc/${eventId}` },
  { name: 'Splits - Running Events (run_split_report)', url: `https://athleticlive.blob.core.windows.net/\$web/run_split_report/_doc/IRSR%7C${runningEventId}` },
  { name: 'Records (record_report)', url: `https://athleticlive.blob.core.windows.net/\$web/record_report/_doc/records%7C${meetId}` },
  { name: 'Start List - DEPRECATED (ind_start_list)', url: `https://athleticlive.blob.core.windows.net/\$web/ind_start_list/_doc/${eventId}` },
  { name: 'Splits - DEPRECATED (ind_splits)', url: `https://athleticlive.blob.core.windows.net/\$web/ind_splits/_doc/${eventId}` },
];

async function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    https.get(endpoint.url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            const size = Buffer.byteLength(data, 'utf8');
            console.log(`✅ ${endpoint.name}: ${res.statusCode} (${(size/1024).toFixed(2)} KB)`);
            if (json._source) {
              const keys = Object.keys(json._source).slice(0, 10);
              console.log(`   Fields: ${keys.join(', ')}`);
            }
          } catch (e) {
            console.log(`✅ ${endpoint.name}: ${res.statusCode} (JSON parse error)`);
          }
        } else {
          console.log(`❌ ${endpoint.name}: ${res.statusCode}`);
        }
        resolve();
      });
    }).on('error', (e) => {
      console.log(`❌ ${endpoint.name}: ${e.message}`);
      resolve();
    });
  });
}

(async () => {
  console.log('Testing Athletic.net API Endpoints:\n');
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
  }
})();
