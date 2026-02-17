#!/usr/bin/env node
/**
 * Fix NULL genders in athletes table by inferring from event context
 *
 * Logic: If an athlete is in the same event/meet/heat as other athletes
 * whose gender is known, they must be the same gender.
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixNullGenders() {
  console.log("=".repeat(60));
  console.log("FIX NULL GENDERS");
  console.log("=".repeat(60));

  // Step 1: Find athletes with NULL gender who have results
  const { data: nullGenderAthletes, error: fetchError } = await supabase
    .from("athletes")
    .select("athlete_id, full_name")
    .is("gender", null);

  if (fetchError) {
    console.error("Error fetching athletes:", fetchError);
    return;
  }

  console.log(`\nAthletes with NULL gender: ${nullGenderAthletes.length}`);

  if (nullGenderAthletes.length === 0) {
    console.log("No athletes to fix!");
    return;
  }

  const athleteIds = nullGenderAthletes.map(a => a.athlete_id);
  const athleteMap = new Map(nullGenderAthletes.map(a => [a.athlete_id, a.full_name]));

  // Step 2: Get results for these athletes
  console.log("\nFetching results for NULL gender athletes...");

  let allResults = [];
  const chunkSize = 1000;

  for (let i = 0; i < athleteIds.length; i += chunkSize) {
    const chunk = athleteIds.slice(i, i + chunkSize);
    const { data: results } = await supabase
      .from("results")
      .select("athlete_id, event_id, meet_id, event_name, date")
      .in("athlete_id", chunk);

    if (results) allResults.push(...results);
  }

  console.log(`Found ${allResults.length} results for NULL gender athletes`);

  // Step 3: For each result, find other athletes in the same event
  // who have a known gender
  const genderInferences = new Map(); // athlete_id -> { gender, confidence, source }

  // Group results by event_id + date (same race)
  const eventGroups = new Map();
  for (const r of allResults) {
    const key = `${r.event_id}|${r.date}`;
    if (!eventGroups.has(key)) {
      eventGroups.set(key, []);
    }
    eventGroups.get(key).push(r);
  }

  console.log(`\nAnalyzing ${eventGroups.size} unique events...`);

  let processed = 0;
  for (const [eventKey, eventResults] of eventGroups) {
    const [eventId, date] = eventKey.split("|");

    // Get all results for this event
    const { data: allEventResults } = await supabase
      .from("results")
      .select("athlete_id, athletes(gender)")
      .eq("event_id", eventId)
      .eq("date", date)
      .limit(100);

    if (!allEventResults) continue;

    // Find known genders in this event
    const knownGenders = allEventResults
      .filter(r => r.athletes?.gender)
      .map(r => r.athletes.gender);

    if (knownGenders.length === 0) continue;

    // Check if all known genders are the same
    const uniqueGenders = [...new Set(knownGenders)];
    if (uniqueGenders.length !== 1) continue; // Mixed genders, skip

    const inferredGender = uniqueGenders[0];

    // Apply this gender to our NULL gender athletes in this event
    for (const r of eventResults) {
      if (!genderInferences.has(r.athlete_id)) {
        genderInferences.set(r.athlete_id, {
          gender: inferredGender,
          source: r.event_name,
          eventId: eventId
        });
      }
    }

    processed++;
    if (processed % 100 === 0) {
      console.log(`  Processed ${processed}/${eventGroups.size} events, inferred ${genderInferences.size} genders`);
    }
  }

  console.log(`\nInferred genders for ${genderInferences.size} athletes`);

  // Step 4: Also infer from event names as fallback
  console.log("\nChecking event names for remaining athletes...");

  for (const r of allResults) {
    if (genderInferences.has(r.athlete_id)) continue;

    const eventLower = r.event_name.toLowerCase();
    let gender = null;

    if (eventLower.includes("women") || eventLower.includes("girl") || eventLower.includes("female")) {
      gender = "F";
    } else if (eventLower.includes("men") || eventLower.includes("boy") || eventLower.includes("male")) {
      // Make sure it's not "women"
      if (!eventLower.includes("women")) {
        gender = "M";
      }
    }

    if (gender) {
      genderInferences.set(r.athlete_id, {
        gender: gender,
        source: `event name: ${r.event_name}`,
        eventId: null
      });
    }
  }

  console.log(`Total genders inferred: ${genderInferences.size}`);

  // Count by gender
  let mCount = 0, fCount = 0;
  for (const [id, info] of genderInferences) {
    if (info.gender === "M") mCount++;
    else fCount++;
  }
  console.log(`  Male: ${mCount}`);
  console.log(`  Female: ${fCount}`);

  // Step 5: Update the database
  console.log("\nUpdating database...");

  let updated = 0;
  let errors = 0;

  for (const [athleteId, info] of genderInferences) {
    const { error } = await supabase
      .from("athletes")
      .update({ gender: info.gender })
      .eq("athlete_id", athleteId);

    if (error) {
      errors++;
    } else {
      updated++;
    }

    if ((updated + errors) % 500 === 0) {
      console.log(`  Updated ${updated}, errors ${errors}`);
    }
  }

  console.log(`\nCompleted!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Errors: ${errors}`);

  // Check remaining NULL genders
  const { count: remaining } = await supabase
    .from("athletes")
    .select("*", { count: "exact", head: true })
    .is("gender", null);

  console.log(`  Remaining NULL genders: ${remaining}`);
}

fixNullGenders().catch(console.error);
