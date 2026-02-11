require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Load WA coefficients
const coefficients = JSON.parse(fs.readFileSync('./frontend/data/wa-coefficients-2025.json', 'utf8'));

// Event mappings
const EVENT_MAP = {
  '60 Meters': '60m', '60m': '60m',
  '200 Meters': '200m', '200m': '200m',
  '400 Meters': '400m', '400m': '400m',
  '600 Meters': '600m', '600m': '600m',
  '800 Meters': '800m', '800m': '800m',
  '1000 Meters': '1000m', '1000m': '1000m',
  'Mile': 'Mile', '1 Mile': 'Mile',
  '3000 Meters': '3000m', '5000 Meters': '5000m',
  '60 Hurdles': '60mH', '60 Meter Hurdles': '60mH',
  'High Jump': 'HJ', 'Long Jump': 'LJ', 'Triple Jump': 'TJ',
  'Pole Vault': 'PV', 'Shot Put': 'SP', 'Weight Throw': 'WT',
};

const FIELD_EVENTS = ['HJ', 'PV', 'LJ', 'TJ', 'SP', 'DT', 'HT', 'JT', 'WT'];

function parseMark(mark, eventName) {
  if (!mark) return null;
  const waEvent = EVENT_MAP[eventName];

  // Field event
  if (waEvent && FIELD_EVENTS.includes(waEvent)) {
    const ftIn = mark.match(/(\d+)'\s*(\d+(?:\.\d+)?)"/);
    if (ftIn) return (parseFloat(ftIn[1]) * 12 + parseFloat(ftIn[2])) * 0.0254;
    const m = mark.match(/([\d.]+)\s*m?/);
    if (m) return parseFloat(m[1]);
    return null;
  }

  // Track event - parse time
  const clean = mark.replace(/[^\d:.]/g, '');
  const hms = clean.match(/^(\d+):(\d{2}):(\d{2}\.?\d*)$/);
  if (hms) return parseInt(hms[1]) * 3600 + parseInt(hms[2]) * 60 + parseFloat(hms[3]);
  const ms = clean.match(/^(\d+):(\d{2}\.?\d*)$/);
  if (ms) return parseInt(ms[1]) * 60 + parseFloat(ms[2]);
  const s = clean.match(/^(\d+\.?\d*)$/);
  if (s) return parseFloat(s[1]);
  return null;
}

function calculateWAPoints(mark, eventName, gender) {
  const waEvent = EVENT_MAP[eventName];
  if (!waEvent) return null;

  const genderKey = gender === 'F' ? 'women' : 'men';
  const coef = coefficients[genderKey]?.[waEvent];
  if (!coef) return null;

  const x = parseMark(mark, eventName);
  if (x === null) return null;

  const [a, b, c] = coef;
  return Math.max(0, Math.round(a * x * x + b * x + c));
}

async function testFullFlow() {
  console.log('=== FULL BACKEND TEST ===\n');

  console.time('Total time');

  // Fetch
  console.time('1. DB fetch');
  const { data, error } = await supabase.rpc('get_weekly_performances', {
    p_start_date: '2026-02-01',
    p_end_date: '2026-02-08',
    p_division: null,
    p_limit: 5000
  });
  console.timeEnd('1. DB fetch');
  console.log('   Results:', data?.length || 0);

  if (error) { console.log('Error:', error.message); return; }

  // WA scoring
  console.time('2. WA scoring');
  const withPoints = data.map(r => ({
    ...r,
    waPoints: calculateWAPoints(r.mark_raw, r.event_name, r.gender) || 0
  })).filter(p => p.waPoints > 0);
  console.timeEnd('2. WA scoring');
  console.log('   Valid scores:', withPoints.length);

  // Sort & dedupe
  console.time('3. Sort & dedupe');
  const sorted = withPoints.sort((a, b) => b.waPoints - a.waPoints);
  const seen = new Set();
  const deduped = sorted.filter(p => {
    if (seen.has(p.athlete_id)) return false;
    seen.add(p.athlete_id);
    return true;
  });
  console.timeEnd('3. Sort & dedupe');
  console.log('   Unique athletes:', deduped.length);

  console.timeEnd('Total time');

  // Top 15
  console.log('\n=== TOP 15 OVERALL ===\n');
  deduped.slice(0, 15).forEach((p, i) => {
    console.log(
      String(i + 1).padStart(2) + '.',
      String(p.waPoints).padStart(4), 'pts |',
      p.mark_raw.padEnd(10), '|',
      p.event_name.padEnd(14), '|',
      (p.gender === 'F' ? 'W' : 'M'), '|',
      p.full_name.substring(0, 22).padEnd(22), '|',
      p.school_name?.substring(0, 20) || ''
    );
  });

  // By division
  console.log('\n=== TOP 5 BY DIVISION ===\n');
  for (const div of ['D1', 'D2', 'D3']) {
    const divResults = deduped.filter(p => {
      const d = (p.division || '').toUpperCase();
      if (div === 'D1') return d === 'DI' || d === 'D1' || d.includes('DIVISION I') && !d.includes('II');
      if (div === 'D2') return d === 'DII' || d === 'D2' || d.includes('DIVISION II') && !d.includes('III');
      if (div === 'D3') return d === 'DIII' || d === 'D3' || d.includes('DIVISION III');
      return false;
    });
    console.log(div + ' (' + divResults.length + ' athletes):');
    divResults.slice(0, 5).forEach((p, i) => {
      console.log('  ', (i+1) + '.', p.waPoints, 'pts -', p.mark_raw, '-', p.event_name, '-', p.full_name);
    });
    console.log('');
  }
}

testFullFlow();
