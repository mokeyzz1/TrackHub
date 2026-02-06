/**
 * Analyze School Name Variations
 *
 * Compares school names between TFRRS and Athletic.net to find
 * naming patterns and potential equivalents.
 */

const fs = require('fs');
const path = require('path');

const MAPPING_FILE = path.join(__dirname, './output/athlete-mapping.json');

function analyzeSchoolVariations() {
  console.log('========================================');
  console.log('SCHOOL NAME VARIATION ANALYSIS');
  console.log('========================================\n');

  const mappings = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));

  // Get medium confidence where school doesn't match exactly
  const mediumConf = mappings.filter(m => m.confidence === 'medium');

  // Collect school name pairs
  const schoolPairs = new Map(); // Map of tfrrs_school -> Set of athletic_net_schools
  const pairCounts = new Map();  // Count occurrences of each pair

  for (const m of mediumConf) {
    const tfrrsSchool = m.school_name;
    // Athletic.net format: "School Name (Collegiate)||City, State"
    const anetSchoolFull = m.matched_school || '';
    const anetSchool = anetSchoolFull.split(' (Collegiate)')[0].split('||')[0].trim();

    if (tfrrsSchool && anetSchool && tfrrsSchool.toLowerCase() !== anetSchool.toLowerCase()) {
      const key = `${tfrrsSchool} | ${anetSchool}`;
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);

      if (!schoolPairs.has(tfrrsSchool)) {
        schoolPairs.set(tfrrsSchool, new Set());
      }
      schoolPairs.get(tfrrsSchool).add(anetSchool);
    }
  }

  // Sort by frequency
  const sortedPairs = [...pairCounts.entries()]
    .sort((a, b) => b[1] - a[1]);

  console.log('Top 50 School Name Variations (TFRRS | Athletic.net):\n');
  console.log('Count | TFRRS Name | Athletic.net Name');
  console.log('------|------------|-------------------');

  const variations = [];

  for (let i = 0; i < Math.min(50, sortedPairs.length); i++) {
    const [pair, count] = sortedPairs[i];
    const [tfrrs, anet] = pair.split(' | ');
    console.log(`${count.toString().padStart(5)} | ${tfrrs} | ${anet}`);

    variations.push({ tfrrs, athletic_net: anet, count });
  }

  // Look for patterns
  console.log('\n\n========================================');
  console.log('PATTERN ANALYSIS');
  console.log('========================================\n');

  // Check for common abbreviation patterns
  const patterns = {
    'U. vs University': [],
    'St. vs State': [],
    'IU vs Indiana': [],
    'UC vs California': [],
    'Missing suffix': [],
    'Different format': []
  };

  for (const [pair, count] of sortedPairs) {
    const [tfrrs, anet] = pair.split(' | ');
    const tfrrsLower = tfrrs.toLowerCase();
    const anetLower = anet.toLowerCase();

    // Detect patterns
    if (tfrrsLower.includes('university') && !anetLower.includes('university')) {
      patterns['U. vs University'].push({ tfrrs, anet, count });
    }
    if (tfrrsLower.includes('state') && !anetLower.includes('state')) {
      patterns['St. vs State'].push({ tfrrs, anet, count });
    }
    if ((tfrrsLower.startsWith('iu ') || tfrrsLower.includes('indiana')) &&
        (anetLower.startsWith('iu ') || anetLower.includes('indiana'))) {
      patterns['IU vs Indiana'].push({ tfrrs, anet, count });
    }
    if ((tfrrsLower.startsWith('uc ') || tfrrsLower.includes('california')) &&
        (anetLower.startsWith('uc ') || anetLower.includes('california'))) {
      patterns['UC vs California'].push({ tfrrs, anet, count });
    }
  }

  for (const [pattern, items] of Object.entries(patterns)) {
    if (items.length > 0) {
      console.log(`${pattern}:`);
      items.slice(0, 10).forEach(i => {
        console.log(`  ${i.count}x: "${i.tfrrs}" vs "${i.anet}"`);
      });
      console.log('');
    }
  }

  // Create equivalence map for schools that are clearly the same
  console.log('\n========================================');
  console.log('SUGGESTED SCHOOL EQUIVALENCES');
  console.log('========================================\n');

  // Schools that appear >5 times with same mapping are likely correct
  const suggestedEquivalences = sortedPairs
    .filter(([_, count]) => count >= 5)
    .map(([pair, count]) => {
      const [tfrrs, anet] = pair.split(' | ');
      return { tfrrs, athletic_net: anet, count };
    });

  console.log(`Found ${suggestedEquivalences.length} potential equivalences (>=5 occurrences)\n`);

  // Save for review
  const outputFile = path.join(__dirname, './output/school-equivalences.json');
  fs.writeFileSync(outputFile, JSON.stringify({
    generated_at: new Date().toISOString(),
    description: 'School name variations between TFRRS and Athletic.net',
    total_variations: sortedPairs.length,
    suggested_equivalences: suggestedEquivalences,
    all_variations: variations
  }, null, 2));

  console.log(`Saved to: ${outputFile}`);

  // Summary stats
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Total medium confidence: ${mediumConf.length.toLocaleString()}`);
  console.log(`Unique school pairs: ${sortedPairs.length}`);
  console.log(`Pairs with >=5 occurrences: ${suggestedEquivalences.length}`);

  // Calculate how many medium conf could be upgraded
  const upgradeable = suggestedEquivalences.reduce((sum, e) => sum + e.count, 0);
  console.log(`Athletes upgradeable to high conf: ${upgradeable.toLocaleString()}`);
}

analyzeSchoolVariations();
