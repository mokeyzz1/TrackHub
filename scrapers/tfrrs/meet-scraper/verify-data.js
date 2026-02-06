const d = JSON.parse(require('fs').readFileSync('output/meet-results.json', 'utf8'));

console.log('=== DATA VERIFICATION ===\n');
console.log('Total results:', d.length.toLocaleString());

// Check for nulls
console.log('\nNull/empty checks:');
console.log('  athlete_id null:', d.filter(r => r.athlete_id === null).length);
console.log('  event_name empty:', d.filter(r => !r.event_name).length);
console.log('  mark_raw empty:', d.filter(r => !r.mark_raw).length);
console.log('  school_name empty:', d.filter(r => !r.school_name).length);
console.log('  date empty:', d.filter(r => !r.date).length);

// Check relays
const relays = d.filter(r => r.is_relay === true);
const individuals = d.filter(r => r.is_relay === false);
console.log('\nResult types:');
console.log('  Individual:', individuals.length.toLocaleString());
console.log('  Relay:', relays.length.toLocaleString());

// Sample individual results
console.log('\nSample individual results:');
individuals.slice(0, 8).forEach(r => {
  console.log(`  ${r.athlete_name} | ${r.event_name} | ${r.mark_raw} | ${r.school_name}`);
});

// Sample relay results
console.log('\nSample relay results:');
relays.slice(0, 3).forEach(r => {
  console.log(`  ${r.event_name} | ${r.mark_raw} | ${r.school_name} | ${r.athlete_name.substring(0, 50)}...`);
});

// Events breakdown
console.log('\nTop 15 events:');
const byEvent = {};
d.forEach(r => { byEvent[r.event_name] = (byEvent[r.event_name] || 0) + 1; });
Object.entries(byEvent).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([e, c]) => {
  console.log(`  ${c.toLocaleString().padStart(8)} | ${e}`);
});

// Check weird marks
console.log('\nMark format samples:');
const markSamples = {};
d.forEach(r => {
  if (r.mark_raw && !markSamples[r.mark_raw.substring(0, 10)]) {
    markSamples[r.mark_raw.substring(0, 10)] = r.mark_raw;
  }
});
Object.values(markSamples).slice(0, 15).forEach(m => console.log('  ', m));

// Schools without team match
console.log('\nSchools with no team match (sample):');
const noMatch = d.filter(r => r.school_name && !r.team_gender);
const uniqueSchools = [...new Set(noMatch.map(r => r.school_name))];
uniqueSchools.slice(0, 10).forEach(s => console.log('  ', s));
