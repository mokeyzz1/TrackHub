const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  let total = 0;
  const allMeets = new Set();

  // Scan by result_id ranges (we know range is ~2.2M to ~5.8M)
  for (let start = 2200000; start <= 5900000; start += 50000) {
    const { data, error } = await supabase
      .from('results')
      .select('result_id, meet_id')
      .gte('result_id', start)
      .lt('result_id', start + 50000);

    if (error) {
      console.log('Error at', start, ':', error.message);
      continue;
    }

    data?.forEach(r => {
      if (r.meet_id) {
        total++;
        allMeets.add(r.meet_id);
      }
    });

    process.stdout.write('\rScanned ' + start.toLocaleString() + '-' + (start+50000).toLocaleString() + ', found ' + total.toLocaleString() + ' results, ' + allMeets.size + ' meets...');
  }

  console.log('\n\nTotal results WITH meet_id:', total.toLocaleString());
  console.log('Total unique meets:', allMeets.size);
}
check();
