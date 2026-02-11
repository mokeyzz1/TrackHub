require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const coefficients = JSON.parse(fs.readFileSync('./frontend/data/wa-coefficients-2025.json', 'utf8'));

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
  if (waEvent && FIELD_EVENTS.includes(waEvent)) {
    const ftIn = mark.match(/(\d+)'\s*(\d+(?:\.\d+)?)"/);
    if (ftIn) return (parseFloat(ftIn[1]) * 12 + parseFloat(ftIn[2])) * 0.0254;
    const m = mark.match(/([\d.]+)\s*m?/);
    if (m) return parseFloat(m[1]);
    return null;
  }
  const clean = mark.replace(/[^\d:.]/g, '');
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

async function getTopPerformances() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     TOP PERFORMANCES - FEB 7-8, 2026 WEEKEND               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const { data, error } = await supabase.rpc('get_weekly_performances', {
    p_start_date: '2026-02-07',
    p_end_date: '2026-02-08',
    p_division: null,
    p_limit: 5000
  });

  if (error) { console.log('Error:', error.message); return; }
  console.log('Total results this weekend:', data.length);

  const withPoints = data.map(r => ({
    ...r,
    waPoints: calculateWAPoints(r.mark_raw, r.event_name, r.gender) || 0
  })).filter(p => p.waPoints > 0);

  const sorted = withPoints.sort((a, b) => b.waPoints - a.waPoints);
  const seen = new Set();
  const deduped = sorted.filter(p => {
    if (seen.has(p.athlete_id)) return false;
    seen.add(p.athlete_id);
    return true;
  });

  console.log('Unique athletes with WA scores:', deduped.length);

  // TOP 5 MEN
  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│                      TOP 5 MEN                              │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');
  const men = deduped.filter(p => p.gender === 'M');
  men.slice(0, 5).forEach((p, i) => {
    console.log((i+1) + '. ' + p.full_name);
    console.log('   ' + p.mark_raw + ' | ' + p.event_name + ' | ' + p.waPoints + ' pts');
    console.log('   ' + p.school_name + ' (' + p.division + ')');
    console.log('');
  });

  // TOP 5 WOMEN
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│                     TOP 5 WOMEN                             │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');
  const women = deduped.filter(p => p.gender === 'F');
  women.slice(0, 5).forEach((p, i) => {
    console.log((i+1) + '. ' + p.full_name);
    console.log('   ' + p.mark_raw + ' | ' + p.event_name + ' | ' + p.waPoints + ' pts');
    console.log('   ' + p.school_name + ' (' + p.division + ')');
    console.log('');
  });

  // D1
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│                      TOP 5 D1                               │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');
  const d1 = deduped.filter(p => {
    const d = (p.division || '').toUpperCase();
    return d === 'DI' || d === 'D1' || d.includes('DIVISION I') && !d.includes('II');
  });
  d1.slice(0, 5).forEach((p, i) => {
    console.log((i+1) + '. ' + p.full_name + ' (' + (p.gender === 'F' ? 'W' : 'M') + ')');
    console.log('   ' + p.mark_raw + ' | ' + p.event_name + ' | ' + p.waPoints + ' pts');
    console.log('   ' + p.school_name);
    console.log('');
  });

  // D2
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│                      TOP 5 D2                               │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');
  const d2 = deduped.filter(p => {
    const d = (p.division || '').toUpperCase();
    return d === 'DII' || d === 'D2' || (d.includes('DIVISION II') && !d.includes('III'));
  });
  d2.slice(0, 5).forEach((p, i) => {
    console.log((i+1) + '. ' + p.full_name + ' (' + (p.gender === 'F' ? 'W' : 'M') + ')');
    console.log('   ' + p.mark_raw + ' | ' + p.event_name + ' | ' + p.waPoints + ' pts');
    console.log('   ' + p.school_name);
    console.log('');
  });

  // D3
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│                      TOP 5 D3                               │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');
  const d3 = deduped.filter(p => {
    const d = (p.division || '').toUpperCase();
    return d === 'DIII' || d === 'D3' || d.includes('DIVISION III');
  });
  d3.slice(0, 5).forEach((p, i) => {
    console.log((i+1) + '. ' + p.full_name + ' (' + (p.gender === 'F' ? 'W' : 'M') + ')');
    console.log('   ' + p.mark_raw + ' | ' + p.event_name + ' | ' + p.waPoints + ' pts');
    console.log('   ' + p.school_name);
    console.log('');
  });
}

getTopPerformances();
