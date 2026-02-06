const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: results, error: resultsError } = await supabase.from('results').select('result_id').limit(5);
  console.log('Sample results:', results);
  if (resultsError) console.log('Results error:', resultsError.message);

  // Get max result_id
  const { data: maxResult } = await supabase.from('results').select('result_id').order('result_id', { ascending: false }).limit(1);
  console.log('Max result_id:', maxResult?.[0]?.result_id);

  // Count athletes
  const { count: athleteCount } = await supabase.from('athletes').select('*', { count: 'exact', head: true });
  console.log('Athletes count:', athleteCount);
})();
