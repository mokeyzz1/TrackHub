#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function createTestData() {
  console.log('🚀 Creating test data for your TrackHub app...');
  
  const supabase = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 1. Create a test school
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .insert([
        {
          official_name: 'Stanford University',
          short_name: 'Stanford',
          city: 'Stanford',
          state: 'CA',
          division: 'DI',
          is_active: true
        }
      ])
      .select()
      .single();

    if (schoolError) throw schoolError;
    console.log(`✅ Created school: ${school.official_name} (ID: ${school.school_id})`);

    // 2. Create a team for this school
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert([
        {
          school_id: school.school_id,
          gender: 'M',
          is_active: true
        }
      ])
      .select()
      .single();

    if (teamError) throw teamError;
    console.log(`✅ Created team: ${school.official_name} Men (ID: ${team.team_id})`);

    // 3. Create test athletes
    const athletes = [
      {
        school_id: school.school_id,
        full_name: 'Ryan Crouser',
        first_name: 'Ryan',
        last_name: 'Crouser',
        gender: 'M',
        class_year: 'SR',
        primary_events: 'SP, DT',
        is_active: true
      },
      {
        school_id: school.school_id,
        full_name: 'Haley Batten',
        first_name: 'Haley', 
        last_name: 'Batten',
        gender: 'F',
        class_year: 'JR',
        primary_events: '1500, 5000',
        is_active: true
      }
    ];

    const { data: athleteData, error: athleteError } = await supabase
      .from('athletes')
      .insert(athletes)
      .select();

    if (athleteError) throw athleteError;
    console.log(`✅ Created ${athleteData.length} athletes`);

    // 4. Create some results for the athletes
    const results = [];
    
    // Shot put results for Ryan Crouser
    results.push({
      athlete_id: athleteData[0].athlete_id,
      team_id: team.team_id,
      event_name: 'SP',
      mark_raw: '22.52m  73\' 10.75"',
      mark_meters: 22.52,
      mark_feet: '73\' 10.75"',
      date: '2024-06-23',
      meet_name: 'NCAA Division I Outdoor Track & Field Championships',
      place: 1,
      is_pr: true,
      is_season_best: true
    });

    results.push({
      athlete_id: athleteData[0].athlete_id,
      team_id: team.team_id,
      event_name: 'SP',
      mark_raw: '22.31m  73\' 2.25"',
      mark_meters: 22.31,
      mark_feet: '73\' 2.25"',
      date: '2024-05-25',
      meet_name: 'Pac-12 Championships',
      place: 1,
      is_pr: false,
      is_season_best: false
    });

    // 1500m results for Haley Batten
    results.push({
      athlete_id: athleteData[1].athlete_id,
      team_id: team.team_id,
      event_name: '1500',
      mark_raw: '4:02.19',
      mark_seconds: 242.19,
      date: '2024-06-08',
      meet_name: 'NCAA Division I Outdoor Track & Field Championships',
      place: 3,
      is_pr: true,
      is_season_best: true
    });

    results.push({
      athlete_id: athleteData[1].athlete_id,
      team_id: team.team_id,
      event_name: '1500',
      mark_raw: '4:05.67',
      mark_seconds: 245.67,
      date: '2024-05-11',
      meet_name: 'Cardinal Classic',
      place: 2,
      is_pr: false,
      is_season_best: false
    });

    const { data: resultsData, error: resultsError } = await supabase
      .from('results')
      .insert(results)
      .select();

    if (resultsError) throw resultsError;
    console.log(`✅ Created ${resultsData.length} results`);

    console.log('\n🎉 Test data created successfully!');
    console.log('📱 Your React Native app now has data to display:');
    console.log(`   • 1 School: ${school.official_name}`);
    console.log(`   • ${athleteData.length} Athletes with performance data`);
    console.log(`   • ${resultsData.length} Meet results`);
    console.log('\n🚀 Ready to test your TrackHub app!');
    console.log(`   • Athlete ID ${athleteData[0].athlete_id}: ${athleteData[0].full_name}`);
    console.log(`   • Athlete ID ${athleteData[1].athlete_id}: ${athleteData[1].full_name}`);

  } catch (error) {
    console.error('❌ Failed to create test data:', error.message);
  }
}

createTestData().catch(console.error);
