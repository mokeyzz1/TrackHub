/**
 * Import meet results to database
 *
 * Usage:
 *   node import-meet-results.js                      # Dry run (all)
 *   node import-meet-results.js --commit --legacy-direct-write # Explicit legacy write
 *   node import-meet-results.js --month 2026-01      # Dry run January only
 *   node import-meet-results.js --month 2026-01 --commit  # Import January only
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { EventResolver } = require('../../shared/event_resolver');
const { parseName } = require('../../shared/name_parser');
const { fingerprint, loadMeetFingerprints, fetchAll, normaliseMarkKey } = require('../../shared/result_fingerprint');
const { requireControlledCommit } = require('../../shared/write_mode_guard');
const ALLOW_UNMAPPED = process.argv.includes('--allow-unmapped');
const LEGACY_DIRECT_WRITE = process.argv.includes('--legacy-direct-write');

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
  requireControlledCommit({
    commit,
    controlPlane: false,
    legacyDirectWrite: LEGACY_DIRECT_WRITE,
    importer: 'legacy TFRRS meet importer'
  });

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
      .select('team_id, gender, school_id, team_name, team_type, schools(short_name, official_name)')
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

    // Explicit affiliations are authoritative when present; retain school-name
    // aliases for legacy rows until the affiliation backfill is complete.
    if (team.team_name) {
      const exactKey = `${team.team_name.toLowerCase()}|${team.gender}`;
      const normKey = `${normalizeSchoolName(team.team_name)}|${team.gender}`;
      if (!teamByName.has(exactKey)) teamByName.set(exactKey, team.team_id);
      if (!teamByName.has(normKey)) teamByName.set(normKey, team.team_id);
    }

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
            ...(parseName(r.athlete_name) || {}),  // first_name/last_name on insert (stops the split-backfill mess recurring)
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
            ...(parseName(r.athlete_name) || {}),  // first_name/last_name on insert
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
  // Resolve the canonical event BEFORE deduping, not at insert time. The fingerprint keys on
  // event_type_id, and if it is still undefined here every fingerprint collapses to
  // "athlete|undefined|mark" — which silently matches the wrong rows.
  const validResults = dbResults.filter(r => r.athlete_id != null)
    .map(r => ({ ...r, event_type_id: events.resolve(r.event_name) }));
  console.log(`\nImporting ${validResults.length.toLocaleString()} results (skipping ${dbResults.length - validResults.length} relays)...`);

  // ⚠️ PRE-FLIGHT GATE — refuse to write rows we cannot categorise.
  //
  // WHY. On 2026-08-19 this importer wrote 10,137 rows, reported "COMPLETE" and exited 0 while
  // leaving 310 rows with a NULL event_type_id from 7 unmapped names ("1500m Run", "800m Run",
  // "200m Dash", "(Invite)"/"(Afternoon)" session variants). Those rows cannot be grouped, ranked
  // or PR-ed, and they broke the 100%-event-coverage invariant the moment they landed — but the
  // run announced success, so nothing stopped. That is the same class as the older
  // "31 meets marked imported while writing nothing" (CLAUDE.md). An importer that cannot FAIL
  // is not a guard.
  //
  // The names are logged either way, so the fix is: add the alias, re-run. Nothing is lost by
  // stopping, and a partial import is far more expensive to unpick than a refused one.
  if (commit && events.unmappedCount > 0 && !ALLOW_UNMAPPED) {
    const rowsAffected = validResults.filter(r => r.event_type_id == null).length;
    console.error(`\n✖ REFUSING TO IMPORT — ${events.unmappedCount} event name(s) have no alias, `
                + `which would leave ${rowsAffected.toLocaleString()} rows with a NULL event_type_id.`);
    [...events.unmapped.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([name, n]) => console.error(`    ${String(n).padStart(6)}x  ${name}`));
    console.error(`\n  Fix: add these to event_aliases (look the id up in event_types — do NOT`);
    console.error(`  guess it; "5,000 Meters" was mis-filed as 10k XC that way), then re-run.`);
    console.error(`  To import anyway and accept the NULLs: --allow-unmapped\n`);
    await events.flushUnmapped(supabase);   // still record them for review
    process.exit(1);
  }

  // Check for existing results to avoid duplicates
  console.log('Checking for existing results to avoid duplicates...');
  // ⚠️ CROSS-SOURCE DUPLICATE GUARD — see scrapers/shared/result_fingerprint.js for the full
  // story. The key used to be `athlete|event_NAME|RAW mark|date`, and it had three defects that
  // together put the NCAA DII 4x100 on an athlete's profile FOUR times (1,252 rows / 243 meets):
  //   1. RAW mark, so the stored athletic.net "45.15a" never matched this importer's "45.15" —
  //      the trailing `a` is a source timing annotation, not part of the numeric time;
  //   2. event_NAME, which differs by source ("60mh" vs "60 Meter Hurdles");
  //   3. a bare .select(), capped by PostgREST at 1000 rows, so in meet 13142 (1,937 rows) the
  //      guard could not even see all of its own meet.
  // Both importers now share one definition, so they cannot drift apart again.
  const meetIds = [...new Set(validResults.map(r => r.meet_id).filter(Boolean))];
  const existingResults = await loadMeetFingerprints(supabase, meetIds);
  console.log(`Found ${existingResults.size.toLocaleString()} existing performances in these meets`);

  const newResults = validResults.filter(r => !existingResults.has(fingerprint(r)));

  const skippedDupes = validResults.length - newResults.length;
  console.log(`Skipping ${skippedDupes.toLocaleString()} duplicates, importing ${newResults.length.toLocaleString()} new results`);

  let imported = 0;
  let errors = 0;

  for (let i = 0; i < newResults.length; i += 500) {
    const batch = newResults.slice(i, i + 500).map(r => ({
      athlete_id: r.athlete_id,
      event_name: r.event_name,
      event_type_id: r.event_type_id,  // resolved above, before dedup; null -> logged to unmapped_events
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

  // ⚠️ POST-WRITE VERIFICATION — "verify after writing, don't assume" (CLAUDE.md §4), enforced
  // rather than left to whoever remembers to run a query afterwards. Re-reads the meets we just
  // touched and checks the two things this importer can actually break.
  let failed = errors > 0;
  if (commit && meetIds.length) {
    console.log('\nVerifying what was actually written...');
    const nullEvent = await fetchAll(() => supabase.from('results')
      .select('result_id').in('meet_id', meetIds).is('event_type_id', null));
    const written = await fetchAll(() => supabase.from('results')
      .select('meet_id, athlete_id, event_type_id, mark_raw, place, round')
      .in('meet_id', meetIds).not('athlete_id', 'is', null));

    // Identical round AND place is a true duplicate; differing round is a real prelim/final.
    const seen = new Map();
    let trueDupes = 0;
    for (const r of written) {
      const k = `${r.meet_id}|${r.athlete_id}|${r.event_type_id}|${normaliseMarkKey(r.mark_raw)}|${r.place}|${r.round}`;
      if (seen.has(k)) trueDupes++; else seen.set(k, 1);
    }

    console.log(`  rows with NULL event_type_id: ${nullEvent.length}`);
    console.log(`  duplicate performances (identical round AND place): ${trueDupes}`);
    if (nullEvent.length || trueDupes) failed = true;
  }

  console.log('\n========================================');
  console.log(failed ? 'COMPLETED WITH PROBLEMS' : 'COMPLETE');
  console.log('========================================');
  console.log(`Imported: ${imported.toLocaleString()}`);
  console.log(`Errors: ${errors.toLocaleString()}`);
  if (failed) {
    console.error('\n✖ This run did NOT finish clean. Do not treat these meets as done —');
    console.error('  fix the cause above and re-run, or roll back per docs/RECOVERY.md.');
  }
  return failed ? 1 : 0;
}

const commit = process.argv.includes('--commit');
// Exit code must reflect reality. This used to be `.catch(console.error)`, which printed the
// error and then exited 0 — so a crashed or damaged import looked identical to a clean one to
// any caller, cron job or human skim-reading the tail of a log.
importMeetResults(commit)
  .then(code => process.exit(code))
  .catch(e => { console.error('FATAL:', e.message); process.exit(1); });
