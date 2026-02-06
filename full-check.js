const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://hunbahsnaeeztmzqpnrl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1bmJhaHNuYWVlenRtenFwbnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2MTI5MjEsImV4cCI6MjA4MDE4ODkyMX0.dLjVdd5cnjwFMJkFP2a2xho4GWm1mgqvJK2JVDzqfnw'
);

async function check() {
  console.log('=== CHECKING ATHLETES WITH/WITHOUT RESULTS ===\n');

  // Get all athlete IDs (paginated)
  let allAthleteIds = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('athletes')
      .select('athlete_id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !data || data.length === 0) break;
    allAthleteIds.push(...data.map(a => a.athlete_id));
    page++;

    if (data.length < pageSize) break;
  }

  console.log('Total athletes fetched:', allAthleteIds.length);

  // Now check which have results - batch check
  let athletesWithResults = 0;
  let athletesWithoutResults = 0;
  const batchSize = 100;

  for (let i = 0; i < allAthleteIds.length; i += batchSize) {
    const batch = allAthleteIds.slice(i, i + batchSize);

    // Get distinct athlete_ids from results for this batch
    const { data: resultsData } = await supabase
      .from('results')
      .select('athlete_id')
      .in('athlete_id', batch);

    const idsWithResults = new Set((resultsData || []).map(r => r.athlete_id));

    for (const id of batch) {
      if (idsWithResults.has(id)) {
        athletesWithResults++;
      } else {
        athletesWithoutResults++;
      }
    }

    if ((i + batchSize) % 10000 === 0) {
      console.log(`Checked ${i + batchSize} athletes...`);
    }
  }

  console.log('\n=== RESULTS ===');
  console.log('Athletes WITH results:', athletesWithResults.toLocaleString());
  console.log('Athletes WITHOUT results:', athletesWithoutResults.toLocaleString());
  console.log('Percentage without:', ((athletesWithoutResults / allAthleteIds.length) * 100).toFixed(1) + '%');

  // Sample some athletes without results
  console.log('\nSample athletes WITHOUT results:');

  const sampleWithout = [];
  for (let i = 0; i < allAthleteIds.length && sampleWithout.length < 10; i++) {
    const id = allAthleteIds[i];
    const { count } = await supabase
      .from('results')
      .select('*', { count: 'exact', head: true })
      .eq('athlete_id', id);

    if (count === 0) {
      const { data: athlete } = await supabase
        .from('athletes')
        .select('full_name, school_id')
        .eq('athlete_id', id)
        .single();

      if (athlete) {
        // Get school name
        const { data: school } = await supabase
          .from('schools')
          .select('name')
          .eq('school_id', athlete.school_id)
          .single();

        sampleWithout.push({
          id,
          name: athlete.full_name,
          school: school?.name || 'Unknown'
        });
      }
    }
  }

  sampleWithout.forEach(a => {
    console.log(`  - ${a.name} (${a.school}) [ID: ${a.id}]`);
  });
}

check();
