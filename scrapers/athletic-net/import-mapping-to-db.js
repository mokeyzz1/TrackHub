/**
 * Import Athletic.net Mapping to Database
 *
 * Updates athletes table with athletic_net_url from mapping file.
 * Imports HIGH confidence matches and MEDIUM confidence matches
 * where schools are verified equivalences.
 *
 * Usage:
 *   node import-mapping-to-db.js          # Dry run
 *   node import-mapping-to-db.js --commit # Actually update
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAPPING_FILE = path.join(__dirname, './output/athlete-mapping.json');
const EQUIVALENCES_FILE = path.join(__dirname, './output/verified-school-equivalences.json');

// Build lookup map for school equivalences
function loadSchoolEquivalences() {
  const data = JSON.parse(fs.readFileSync(EQUIVALENCES_FILE, 'utf-8'));
  const map = new Map();

  for (const eq of data.equivalences) {
    // Map TFRRS name -> Athletic.net name
    map.set(eq.tfrrs.toLowerCase(), eq.athletic_net.toLowerCase());
  }

  return map;
}

// Check if a medium confidence match has verified school equivalence
function isVerifiedSchoolMatch(mapping, equivalences) {
  const tfrrsSchool = (mapping.school_name || '').toLowerCase();
  const anetSchoolFull = mapping.matched_school || '';
  const anetSchool = anetSchoolFull.split(' (Collegiate)')[0].split('||')[0].trim().toLowerCase();

  const expectedAnet = equivalences.get(tfrrsSchool);
  return expectedAnet === anetSchool;
}

async function importMapping(commit = false) {
  console.log('========================================');
  console.log(commit ? 'IMPORTING MAPPING TO DATABASE' : 'DRY RUN');
  console.log('========================================\n');

  // Load mapping and equivalences
  const mappings = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));
  const equivalences = loadSchoolEquivalences();

  console.log(`Loaded ${mappings.length.toLocaleString()} mappings`);
  console.log(`Loaded ${equivalences.size} verified school equivalences\n`);

  // Count by confidence
  const byConfidence = { high: 0, medium: 0, low: 0 };
  mappings.forEach(m => {
    byConfidence[m.confidence] = (byConfidence[m.confidence] || 0) + 1;
  });
  console.log('By confidence:', byConfidence);

  // Filter: HIGH confidence + MEDIUM with verified school equivalence
  const highConf = mappings.filter(m => m.confidence === 'high');
  const mediumConf = mappings.filter(m => m.confidence === 'medium');
  const verifiedMedium = mediumConf.filter(m => isVerifiedSchoolMatch(m, equivalences));

  console.log(`\nHigh confidence: ${highConf.length.toLocaleString()}`);
  console.log(`Medium confidence with verified school: ${verifiedMedium.length.toLocaleString()}`);

  const toImport = [...highConf, ...verifiedMedium];
  console.log(`Total to import: ${toImport.length.toLocaleString()}\n`);

  // Sample
  console.log('Sample HIGH (first 3):');
  highConf.slice(0, 3).forEach(m => {
    console.log(`  ${m.athlete_id} | ${m.full_name} @ ${m.school_name}`);
  });

  console.log('\nSample verified MEDIUM (first 5):');
  verifiedMedium.slice(0, 5).forEach(m => {
    const anetSchool = m.matched_school.split(' (Collegiate)')[0].split('||')[0].trim();
    console.log(`  ${m.athlete_id} | ${m.full_name}`);
    console.log(`    TFRRS: ${m.school_name} -> Athletic.net: ${anetSchool}`);
  });

  if (!commit) {
    console.log('\n>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to update database');
    return;
  }

  // Update in batches
  console.log('\nUpdating database in batches of 500...');
  let updated = 0;
  let errors = 0;
  const batchSize = 500;

  for (let i = 0; i < toImport.length; i += batchSize) {
    const batch = toImport.slice(i, i + batchSize);

    // Update each athlete
    for (const m of batch) {
      const url = `https://www.athletic.net/athlete/${m.athletic_net_id}/track-and-field`;

      const { error } = await supabase
        .from('athletes')
        .update({ athletic_net_url: url })
        .eq('athlete_id', m.athlete_id);

      if (error) {
        errors++;
      } else {
        updated++;
      }
    }

    if ((i + batchSize) % 10000 === 0 || i + batchSize >= toImport.length) {
      console.log(`  ${updated.toLocaleString()}/${toImport.length.toLocaleString()} updated`);
    }
  }

  console.log('\n========================================');
  console.log('COMPLETE');
  console.log('========================================');
  console.log(`Updated: ${updated.toLocaleString()}`);
  console.log(`Errors: ${errors.toLocaleString()}`);
}

const commit = process.argv.includes('--commit');
importMapping(commit).catch(console.error);
