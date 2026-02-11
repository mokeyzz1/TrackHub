require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  let totalDeleted = 0;
  let batch = 1;

  while (true) {
    // Get batch of IDs to delete
    const { data: toDelete } = await supabase
      .from('results')
      .select('result_id')
      .gte('created_at', '2026-02-10')
      .lt('date', '2026-02-06')
      .limit(1000);

    if (!toDelete || toDelete.length === 0) {
      console.log('Done! Total deleted:', totalDeleted.toLocaleString());
      break;
    }

    const ids = toDelete.map(r => r.result_id);

    const { error } = await supabase
      .from('results')
      .delete()
      .in('result_id', ids);

    if (error) {
      console.log('Error:', error.message);
      break;
    }

    totalDeleted += ids.length;
    console.log('Batch', batch, '- Deleted', ids.length, '| Total:', totalDeleted.toLocaleString());
    batch++;
  }

  // Final count
  const { count } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true });
  console.log('Results remaining:', count?.toLocaleString());
})();
