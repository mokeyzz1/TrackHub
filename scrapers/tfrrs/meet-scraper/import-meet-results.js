/**
 * Import meet results to database
 *
 * Usage:
 *   node import-meet-results.js                      # Dry run (all)
 *   node import-meet-results.js --commit             # Import all
 *   node import-meet-results.js --month 2026-01      # Dry run January only
 *   node import-meet-results.js --month 2026-01 --commit  # Import January only
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { EventResolver } = require('../../shared/event_resolver');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Resolves raw event names -> canonical event_type_id via event_aliases (loaded in main).
const events = new EventResolver();

const RESULTS_FILE = path.join(__dirname, 'output/meet-results.json');

// School ID for unattached athletes (created in schools table)
const UNATTACHED_SCHOOL_ID = 1835;

// Normalize school name for matching (handles punctuation variations)
function normalizeSchoolName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // Replace punctuation with space
    .replace(/\s+/g, ' ')          // Collapse multiple spaces
    .trim();
}

async function importMeetResults(commit = false) {
  console.log('========================================');
  console.log(commit ? 'IMPORTING MEET RESULTS' : 'DRY RUN');
  console.log('========================================\n');

  // Load the canonical event catalog so results get a resolved event_type_id.
  const aliasCount = await events.load(supabase);
  console.log(`Loaded ${aliasCount.toLocaleString()} event aliases for resolution.\n`);

  // Load scraped results
  if (!fs.existsSync(RESULTS_FILE)) {
    console.log('No results file found. Run scrape-meet-results.js first.');
    return;
  }

  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  console.log(`Loaded ${results.length.toLocaleString()} results\n`);

  // Load all teams for matching
  console.log('Loading teams from database...');
  let allTeams = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data: batch, error } = await supabase
      .from('teams')
      .select('team_id, gender, school_id, schools(short_name, official_name)')
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error loading teams:', error.message);
      break;
    }

    if (!batch || batch.length === 0) break;
    allTeams = allTeams.concat(batch);
    offset += pageSize;
    if (batch.length < pageSize) break;
  }

  console.log(`Loaded ${allTeams.length} teams\n`);

  // Build team lookup by school name and team_id -> school_id mapping
  // Uses normalized names for matching (handles punctuation variations)
  const teamByName = new Map();
  const teamToSchool = new Map();
  for (const team of allTeams) {
    const shortName = team.schools?.short_name;
    const officialName = team.schools?.official_name;

    teamToSchool.set(team.team_id, team.school_id);

    // Add both exact (lowercase) and normalized versions for lookup
    if (shortName) {
      const exactKey = `${shortName.toLowerCase()}|${team.gender}`;
      const normKey = `${normalizeSchoolName(shortName)}|${team.gender}`;
      if (!teamByName.has(exactKey)) teamByName.set(exactKey, team.team_id);
      if (!teamByName.has(normKey)) teamByName.set(normKey, team.team_id);
    }
    if (officialName) {
      const exactKey = `${officialName.toLowerCase()}|${team.gender}`;
      const normKey = `${normalizeSchoolName(officialName)}|${team.gender}`;
      if (!teamByName.has(exactKey)) teamByName.set(exactKey, team.team_id);
      if (!teamByName.has(normKey)) teamByName.set(normKey, team.team_id);
    }
  }

  // Check for existing athletes (lookup by tfrrs_athlete_id)
  console.log('Loading existing athletes...');
  const tfrrsIds = [...new Set(results.map(r => r.athlete_id).filter(id => id != null))];
  const tfrrsToInternalId = new Map(); // tfrrs_athlete_id -> internal athlete_id

  for (let i = 0; i < tfrrsIds.length; i += 1000) {
    const chunk = tfrrsIds.slice(i, i + 1000).map(String); // Convert to strings
    const { data, error } = await supabase
      .from('athletes')
      .select('athlete_id, tfrrs_athlete_id')
      .in('tfrrs_athlete_id', chunk);

    if (data) {
      data.forEach(a => tfrrsToInternalId.set(parseInt(a.tfrrs_athlete_id), a.athlete_id));
    }

    if ((i + 1000) % 10000 === 0) {
      console.log(`  Checked ${i + 1000}/${tfrrsIds.length} athletes...`);
    }
  }

  console.log(`Found ${tfrrsToInternalId.size} existing athletes\n`);

  // Pre-load existing Unattached athletes (no TFRRS id) by name, so weekly re-syncs REUSE
  // them instead of creating a fresh duplicate every weekend. Not doing this is what leaked
  // ~34k orphan name-only rows over a season: each run only remembered its OWN creations, so
  // the same post-collegiate athlete got a new row every weekend and results landed on one copy.
  console.log('Loading existing unattached athletes by name...');
  const existingUnattachedByName = new Map(); // full_name -> athlete_id
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('athletes')
      .select('athlete_id, full_name')
      .eq('school_id', UNATTACHED_SCHOOL_ID)
      .is('tfrrs_athlete_id', null)
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    data.forEach(a => {
      if (!existingUnattachedByName.has(a.full_name)) existingUnattachedByName.set(a.full_name, a.athlete_id);
    });
    if (data.length < 1000) break;
  }
  console.log(`Found ${existingUnattachedByName.size} existing unattached athletes\n`);

  // Process results
  let matched = 0;
  let noTeam = 0;
  let noAthlete = 0;

  const dbResults = [];
  const newAthletes = [];
  const seenAthletes = new Set();

  for (const r of results) {
    // Find team_id
    let teamId = null;
    if (r.school_name) {
      // Try to match by school name and determine gender from event
      const isFemale = r.event_name?.toLowerCase().includes('women') ||
                       r.team_gender === 'F';
      const gender = isFemale ? 'F' : 'M';

      // Try exact match first, then normalized
      const exactKey = `${r.school_name.toLowerCase()}|${gender}`;
      const normKey = `${normalizeSchoolName(r.school_name)}|${gender}`;
      teamId = teamByName.get(exactKey) || teamByName.get(normKey);

      // Try without gender if not found
      if (!teamId) {
        const normName = normalizeSchoolName(r.school_name);
        for (const [k, v] of teamByName) {
          if (k.startsWith(r.school_name.toLowerCase() + '|') || k.startsWith(normName + '|')) {
            teamId = v;
            break;
          }
        }
      }
    }

    if (teamId) {
      matched++;
    } else {
      noTeam++;
    }

    // Check if athlete exists (by TFRRS ID)
    let internalAthleteId = null;

    if (r.athlete_id) {
      // Has TFRRS ID - check if exists
      internalAthleteId = tfrrsToInternalId.get(r.athlete_id);
      if (!internalAthleteId) {
        noAthlete++;
        // Create new athlete record
        if (!seenAthletes.has(r.athlete_id)) {
          seenAthletes.add(r.athlete_id);
          // Use team's school if available, otherwise assign to Unattached
          const schoolId = teamId ? teamToSchool.get(teamId) : UNATTACHED_SCHOOL_ID;
          newAthletes.push({
            tfrrs_athlete_id: String(r.athlete_id),
            full_name: r.athlete_name,
            gender: r.team_gender || null,
            school_id: schoolId,
            is_active: true
          });
        }
      }
    } else if (r.athlete_name) {
      // No TFRRS ID (unattached / post-collegiate). Reuse an existing record by name first —
      // only create if this athlete has never been seen (in the DB or earlier this run).
      const existingId = existingUnattachedByName.get(r.athlete_name);
      if (existingId) {
        internalAthleteId = existingId;
      } else {
        noAthlete++;
        const nameKey = `unattached:${r.athlete_name}`;
        if (!seenAthletes.has(nameKey)) {
          seenAthletes.add(nameKey);
          newAthletes.push({
            tfrrs_athlete_id: null,
            full_name: r.athlete_name,
            gender: r.team_gender || null,
            school_id: UNATTACHED_SCHOOL_ID,
            is_active: true
          });
        }
      }
    }

    dbResults.push({
      tfrrs_athlete_id: r.athlete_id, // Store for later mapping
      athlete_id: internalAthleteId || null, // Will be filled after creating new athletes
      athlete_name: r.athlete_name, // For unattached athlete mapping
      event_name: r.event_name,
      mark_raw: r.mark_raw,
      mark_seconds: r.mark_seconds,
      mark_meters: r.mark_meters,
      place: r.place,
      // Use db_meet_name if available (synced from USTFCCCA), otherwise use TFRRS meet_name
      meet_name: r.db_meet_name || r.meet_name,
      // Use db_meet_id if available (synced from USTFCCCA), otherwise use TFRRS meet_id
      meet_id: r.db_meet_id || r.meet_id,
      event_id: r.event_id,
      date: r.date,
      team_id: teamId,
      round: r.round,
      school_name: r.school_name // Keep for reference
    });
  }

  // Count unattached athletes (assigned to UNATTACHED_SCHOOL_ID)
  const unattachedAthletes = newAthletes.filter(a => a.school_id === UNATTACHED_SCHOOL_ID).length;

  console.log('Processing summary:');
  console.log(`  Team matched: ${matched.toLocaleString()}`);
  console.log(`  No team match: ${noTeam.toLocaleString()}`);
  console.log(`  Missing athletes: ${noAthlete.toLocaleString()}`);
  console.log(`  New athletes to create: ${newAthletes.length.toLocaleString()}`);
  console.log(`  Unattached athletes: ${unattachedAthletes.toLocaleString()}`);

  // Sample
  console.log('\nSample results (first 5):');
  dbResults.slice(0, 5).forEach(r => {
    console.log(`  ${r.athlete_id} | ${r.event_name} | ${r.mark_raw} | team_id: ${r.team_id || 'NULL'}`);
  });

  if (!commit) {
    console.log('\n>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to import');
    return;
  }

  // Create new athletes first
  if (newAthletes.length > 0) {
    console.log('\nCreating new athletes...');
    let athletesCreated = 0;
    let athleteErrors = 0;

    for (let i = 0; i < newAthletes.length; i += 500) {
      const batch = newAthletes.slice(i, i + 500);
      console.log(`  Batch ${i/500 + 1}: inserting ${batch.length} athletes...`);

      const { data, error } = await supabase
        .from('athletes')
        .insert(batch)
        .select('athlete_id, tfrrs_athlete_id');

      if (error) {
        console.log(`  Batch error: ${error.message}. Trying one by one...`);
        // Try one by one
        for (const athlete of batch) {
          const { data: rowData, error: rowError } = await supabase
            .from('athletes')
            .insert(athlete)
            .select('athlete_id, tfrrs_athlete_id')
            .single();
          if (rowError) {
            athleteErrors++;
          } else {
            athletesCreated++;
            if (rowData && rowData.tfrrs_athlete_id) {
              tfrrsToInternalId.set(parseInt(rowData.tfrrs_athlete_id), rowData.athlete_id);
            }
          }
        }
        console.log(`  Batch done: ${athletesCreated} created, ${athleteErrors} errors`);
      } else {
        athletesCreated += batch.length;
        // Add new athletes to mapping
        if (data) {
          data.forEach(a => {
            if (a.tfrrs_athlete_id) {
              tfrrsToInternalId.set(parseInt(a.tfrrs_athlete_id), a.athlete_id);
            }
          });
        }
        console.log(`  Batch success: ${batch.length} athletes created`);
      }

      if ((i + 500) % 2000 === 0 || i + 500 >= newAthletes.length) {
        console.log(`  Progress: ${athletesCreated}/${newAthletes.length} athletes created`);
      }
    }

    console.log(`Athletes created: ${athletesCreated}, errors: ${athleteErrors}`);

    // Build name-to-id map for unattached athletes (no TFRRS ID)
    const nameToInternalId = new Map();
    const { data: unattachedAthletes } = await supabase
      .from('athletes')
      .select('athlete_id, full_name')
      .eq('school_id', UNATTACHED_SCHOOL_ID)
      .is('tfrrs_athlete_id', null);

    unattachedAthletes?.forEach(a => {
      nameToInternalId.set(`unattached:${a.full_name}`, a.athlete_id);
    });

    // Update dbResults with new athlete IDs
    console.log('Mapping new athlete IDs to results...');
    for (const r of dbResults) {
      if (!r.athlete_id) {
        if (r.tfrrs_athlete_id) {
          // Has TFRRS ID - use that mapping
          r.athlete_id = tfrrsToInternalId.get(r.tfrrs_athlete_id) || null;
        } else if (r.athlete_name) {
          // Unattached - use name mapping
          r.athlete_id = nameToInternalId.get(`unattached:${r.athlete_name}`) || null;
        }
      }
    }
  }

  // Import results (skip those without athlete_id - relays not supported yet)
  const validResults = dbResults.filter(r => r.athlete_id != null);
  console.log(`\nImporting ${validResults.length.toLocaleString()} results (skipping ${dbResults.length - validResults.length} relays)...`);

  // Check for existing results to avoid duplicates
  console.log('Checking for existing results to avoid duplicates...');
  const meetIds = [...new Set(validResults.map(r => r.meet_id).filter(Boolean))];
  const existingResults = new Set();

  for (const meetId of meetIds) {
    const { data: existing } = await supabase
      .from('results')
      .select('athlete_id, event_name, mark_raw, date')
      .eq('meet_id', meetId);

    existing?.forEach(r => {
      // Create unique key: athlete_id|event_name|mark_raw|date
      const key = `${r.athlete_id}|${r.event_name}|${r.mark_raw}|${r.date}`;
      existingResults.add(key);
    });
  }
  console.log(`Found ${existingResults.size.toLocaleString()} existing results in these meets`);

  // Filter out duplicates
  const newResults = validResults.filter(r => {
    const key = `${r.athlete_id}|${r.event_name}|${r.mark_raw}|${r.date}`;
    return !existingResults.has(key);
  });

  const skippedDupes = validResults.length - newResults.length;
  console.log(`Skipping ${skippedDupes.toLocaleString()} duplicates, importing ${newResults.length.toLocaleString()} new results`);

  let imported = 0;
  let errors = 0;

  for (let i = 0; i < newResults.length; i += 500) {
    const batch = newResults.slice(i, i + 500).map(r => ({
      athlete_id: r.athlete_id,
      event_name: r.event_name,
      event_type_id: events.resolve(r.event_name),  // canonical event; null -> logged to unmapped_events
      mark_raw: r.mark_raw,
      mark_seconds: r.mark_seconds,
      mark_meters: r.mark_meters,
      place: r.place,
      meet_name: r.meet_name,
      meet_id: r.meet_id,
      event_id: r.event_id,
      date: r.date,
      team_id: r.team_id,
      round: r.round
    }));

    const { error } = await supabase
      .from('results')
      .insert(batch);

    if (error) {
      // Don't drop the whole batch — one bad row would strand 499 athletes' results (and leave
      // those athletes as zero-result shells). Retry row-by-row so only the truly-bad rows fail.
      console.log(`  Batch ${i/500 + 1} error: ${error.message}. Retrying row-by-row...`);
      for (const row of batch) {
        const { error: rowErr } = await supabase.from('results').insert(row);
        if (rowErr) { errors++; } else { imported++; }
      }
    } else {
      imported += batch.length;
    }

    if ((i + 500) % 5000 === 0 || i + 500 >= newResults.length) {
      console.log(`  ${imported.toLocaleString()}/${newResults.length.toLocaleString()} imported (${errors} errors)`);
    }
  }

  // Report/persist any event names that weren't in the alias map (drift detection).
  if (events.unmappedCount > 0) {
    console.log(`\n⚠ ${events.unmappedCount} event name(s) had no alias mapping (event_type_id left null).`);
    if (commit) {
      const flushed = await events.flushUnmapped(supabase);
      console.log(`  Logged ${flushed} to unmapped_events for review — add them to event_aliases.`);
    } else {
      console.log('  (dry run — not logged to unmapped_events)');
    }
  }

  console.log('\n========================================');
  console.log('COMPLETE');
  console.log('========================================');
  console.log(`Imported: ${imported.toLocaleString()}`);
  console.log(`Errors: ${errors.toLocaleString()}`);
}

const commit = process.argv.includes('--commit');
importMeetResults(commit).catch(console.error);
