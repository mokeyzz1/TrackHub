/**
 * Backfill dates on results from meets-to-scrape.json
 * Run after scraper finishes if dates are missing
 */

const fs = require('fs');
const path = require('path');

const RESULTS_FILE = path.join(__dirname, 'output/meet-results.json');
const MEETS_FILE = path.join(__dirname, 'meets-to-scrape.json');

// Load data
const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
const meets = JSON.parse(fs.readFileSync(MEETS_FILE, 'utf-8'));

console.log(`Results: ${results.length.toLocaleString()}`);
console.log(`Meets: ${meets.length}`);

// Build meet name -> date lookup
const dateByMeet = {};
meets.forEach(m => {
  dateByMeet[m.name] = m.date;
});

// Count before
const nullBefore = results.filter(r => !r.date).length;
console.log(`\nResults with null date: ${nullBefore.toLocaleString()}`);

// Backfill
let updated = 0;
results.forEach(r => {
  if (!r.date && r.meet_name && dateByMeet[r.meet_name]) {
    r.date = dateByMeet[r.meet_name];
    updated++;
  }
});

console.log(`Updated: ${updated.toLocaleString()}`);

// Count after
const nullAfter = results.filter(r => !r.date).length;
console.log(`Results still with null date: ${nullAfter.toLocaleString()}`);

// Save
fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
console.log(`\nSaved to ${RESULTS_FILE}`);

// Show by month
const byMonth = {};
results.forEach(r => {
  const month = r.date ? r.date.substring(0, 7) : 'no-date';
  byMonth[month] = (byMonth[month] || 0) + 1;
});
console.log('\nResults by month:');
Object.entries(byMonth).sort().forEach(([m, c]) => console.log(`  ${m}: ${c.toLocaleString()}`));
