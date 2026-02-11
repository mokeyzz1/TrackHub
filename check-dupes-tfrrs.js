const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './scrapers/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: all } = await supabase
    .from('athletes')
    .select('athlete_id, full_name, school_id, tfrrs_athlete_id')
    .eq('is_active', true);
  
  const counts = {};
  all.forEach(a => {
    const key = a.full_name + '|' + a.school_id;
    if (!counts[key]) counts[key] = [];
    counts[key].push(a);
  });
  
  const dupes = Object.entries(counts).filter(e => e[1].length > 1);
  
  console.log('Sample duplicates with TFRRS IDs:\n');
  
  dupes.slice(0, 15).forEach(entry => {
    const name = entry[0].split('|')[0];
    const athletes = entry[1];
    console.log(name + ':');
    athletes.forEach(a => {
      console.log('  ID: ' + a.athlete_id + ' | tfrrs: ' + a.tfrrs_athlete_id);
    });
  });
}

check();
