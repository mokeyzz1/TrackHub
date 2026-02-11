const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const today = new Date().toISOString().split('T')[0];

  const { data: newAthletes } = await supabase
    .from('athletes')
    .select('athlete_id, full_name, tfrrs_athlete_id, school_id, schools(short_name)')
    .gte('created_at', today)
    .not('tfrrs_athlete_id', 'is', null);

  let sameSchool = 0;
  let diffSchool = 0;

  for (const a of newAthletes) {
    if (!a.full_name) continue;

    const { data: matches } = await supabase
      .from('athletes')
      .select('athlete_id, full_name, tfrrs_athlete_id, school_id, schools(short_name)')
      .eq('full_name', a.full_name)
      .neq('athlete_id', a.athlete_id)
      .limit(1);

    if (matches && matches.length > 0) {
      if (a.school_id === matches[0].school_id) {
        sameSchool++;
        console.log('DUPE: ' + a.full_name + ' @ ' + (a.schools?.short_name || '?'));
      } else {
        diffSchool++;
      }
    }
  }

  console.log('');
  console.log('Same name + SAME school (definite dupes):', sameSchool);
  console.log('Same name + DIFF school (could be transfer):', diffSchool);
}
check();
