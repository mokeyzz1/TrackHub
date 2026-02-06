const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://hunbahsnaeeztmzqpnrl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1bmJhaHNuYWVlenRtenFwbnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2MTI5MjEsImV4cCI6MjA4MDE4ODkyMX0.dLjVdd5cnjwFMJkFP2a2xho4GWm1mgqvJK2JVDzqfnw'
);

async function check() {
  console.log('=== CHECKING ATHLETE DISTRIBUTION IN RESULTS ===\n');

  // Sample athlete_ids from different parts of the results table
  const ranges = [
    [0, 999],
    [50000, 50999],
    [100000, 100999],
    [500000, 500999],
    [1000000, 1000999],
    [2000000, 2000999]
  ];

  let allIds = [];
  for (const [start, end] of ranges) {
    const { data } = await supabase.from('results').select('athlete_id').range(start, end);
    if (data) allIds.push(...data.map(r => r.athlete_id));
  }

  const uniqueIds = new Set(allIds.filter(id => id !== null));

  console.log('Sampled', allIds.length, 'results from different ranges');
  console.log('Unique athlete_ids in sample:', uniqueIds.size);
  console.log('\nSample unique IDs:', [...uniqueIds].slice(0, 30).join(', '));

  // Count per athlete
  const idCounts = {};
  allIds.forEach(id => {
    if (id) idCounts[id] = (idCounts[id] || 0) + 1;
  });

  const sorted = Object.entries(idCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);
  console.log('\nTop athletes by result count in sample:');
  for (const [id, count] of sorted) {
    // Get athlete name
    const { data: athlete } = await supabase
      .from('athletes')
      .select('full_name, school_id')
      .eq('athlete_id', id)
      .single();
    console.log(`  ID ${id}: ${count} results - ${athlete?.full_name || 'Unknown'}`);
  }

  // How many total unique athletes in results?
  // We'll need to estimate since we can't do COUNT DISTINCT
  console.log('\n--- Estimating total unique athletes ---');

  // Get a bigger sample
  let bigSample = [];
  for (let i = 0; i < 2200000; i += 100000) {
    const { data } = await supabase.from('results').select('athlete_id').range(i, i + 99);
    if (data) bigSample.push(...data.map(r => r.athlete_id));
  }

  const bigUnique = new Set(bigSample.filter(id => id !== null));
  console.log('Sampled', bigSample.length, 'results (100 per 100k block)');
  console.log('Unique athlete_ids found:', bigUnique.size);
}

check();
