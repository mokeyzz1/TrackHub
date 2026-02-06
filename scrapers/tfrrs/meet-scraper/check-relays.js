const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  let allData = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('relay_results')
      .select('event_name')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    offset += 1000;
  }

  const counts = {};
  allData.forEach(r => {
    counts[r.event_name] = (counts[r.event_name] || 0) + 1;
  });

  console.log('Total relay results:', allData.length);
  console.log('\nRelay results by event:');
  Object.entries(counts).sort((a,b) => b[1] - a[1]).forEach(([name, count]) => {
    console.log('  ' + count.toString().padStart(5) + '  ' + name);
  });
})();
