#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkDatabaseStatus() {
  console.log('🔍 Checking Supabase database status...');
  
  const supabase = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Check each table
    const tables = ['regions', 'conferences', 'schools', 'teams', 'athletes', 'results'];
    
    for (const table of tables) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          console.log(`❌ ${table}: Error - ${error.message}`);
        } else {
          console.log(`📊 ${table}: ${count?.toLocaleString() || 0} records`);
        }
      } catch (err) {
        console.log(`❌ ${table}: Failed to query - ${err.message}`);
      }
    }

    // Get a sample of data from key tables
    console.log('\n📋 Sample data:');
    
    // Sample schools
    const { data: schools } = await supabase
      .from('schools')
      .select('school_id, official_name, division, state')
      .limit(3);
    
    if (schools && schools.length > 0) {
      console.log('\n🏫 Schools (sample):');
      schools.forEach(school => {
        console.log(`   ${school.school_id}: ${school.official_name} (${school.division}, ${school.state})`);
      });
    }

    // Sample athletes
    const { data: athletes } = await supabase
      .from('athletes')
      .select('athlete_id, full_name, school_id')
      .limit(3);
    
    if (athletes && athletes.length > 0) {
      console.log('\n🏃 Athletes (sample):');
      athletes.forEach(athlete => {
        console.log(`   ${athlete.athlete_id}: ${athlete.full_name} (School ID: ${athlete.school_id})`);
      });
    }

    // Sample results
    const { data: results } = await supabase
      .from('results')
      .select('result_id, athlete_id, event_name, mark_raw, meet_name')
      .limit(5);
    
    if (results && results.length > 0) {
      console.log('\n🏃 Results (sample):');
      results.forEach(result => {
        console.log(`   ${result.result_id}: Athlete ${result.athlete_id} - ${result.event_name}: ${result.mark_raw} (${result.meet_name || 'No meet'})`);
      });
    }

  } catch (error) {
    console.error('❌ Failed to check database:', error.message);
  }
}

checkDatabaseStatus().catch(console.error);
