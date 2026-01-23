const fs = require('fs');
const data = JSON.parse(fs.readFileSync('athletic_net_complete_data.json', 'utf8'));

// Get a sample running event with splits
const runningEvent = data.events.find(e => e.splits !== null);

// Get a sample field event
const fieldEvent = data.events.find(e => e.name.includes('Shot Put'));

console.log('=== SAMPLE DATA STRUCTURE ===\n');
console.log('Total Events:', data.totalEvents);
console.log('Meet ID:', data.meetId);
console.log('Meet URL:', data.meetUrl);
console.log('\n--- EVENT CATEGORIES ---');
console.log('Events with Results:', data.events.filter(e => e.results !== null).length);
console.log('Events with Entries:', data.events.filter(e => e.entries !== null).length);
console.log('Events with Heats:', data.events.filter(e => e.heats !== null).length);
console.log('Events with Splits:', data.events.filter(e => e.splits !== null).length);

console.log('\n--- SAMPLE RUNNING EVENT (with splits) ---');
console.log('Event:', runningEvent.name);
console.log('\nResults available:', runningEvent.results !== null);
if (runningEvent.results) {
  console.log('  Number of results:', runningEvent.results.rs?.length || 0);
  if (runningEvent.results.rs && runningEvent.results.rs.length > 0) {
    const sample = runningEvent.results.rs[0];
    console.log('  Sample result:', JSON.stringify(sample, null, 2));
  }
}

console.log('\nSplits available:', runningEvent.splits !== null);
if (runningEvent.splits) {
  console.log('  Splits data keys:', Object.keys(runningEvent.splits));
}

console.log('\n--- SAMPLE FIELD EVENT ---');
console.log('Event:', fieldEvent.name);
if (fieldEvent.results && fieldEvent.results.rs) {
  console.log('Number of competitors:', fieldEvent.results.rs.length);
  if (fieldEvent.results.rs.length > 0) {
    const sample = fieldEvent.results.rs[0];
    console.log('Sample result:', JSON.stringify(sample, null, 2));
  }
}

console.log('\n--- ALL EVENT NAMES ---');
data.events.forEach((e, i) => {
  console.log(`${i+1}. ${e.name}`);
});
