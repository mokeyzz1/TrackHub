// Batch scrape all upcoming meets with URLs
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { smartScrapeMeet } = require('./smart_meet_scraper');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function scrapeAllUpcomingMeets() {
  console.log('\n🎯 BATCH SCRAPER - Upcoming Meets\n');
  console.log('='.repeat(60));

  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  // Get all upcoming meets with URLs
  const { data: meets, error } = await supabase
    .from('meets')
    .select('meet_id, name, date, meet_url')
    .not('meet_url', 'is', null)
    .gte('date', today)
    .lte('date', nextWeekStr)
    .order('date', { ascending: true });

  if (error || !meets || meets.length === 0) {
    console.log('❌ No upcoming meets found with URLs');
    process.exit(1);
  }

  console.log(`\n📋 Found ${meets.length} upcoming meets to scrape\n`);

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (let i = 0; i < meets.length; i++) {
    const meet = meets[i];

    console.log('\n' + '='.repeat(60));
    console.log(`\n[${i + 1}/${meets.length}] ${meet.name}`);
    console.log(`Date: ${meet.date}`);
    console.log('');

    try {
      const result = await smartScrapeMeet(meet.meet_id);

      if (result.success) {
        successCount++;
        console.log(`✅ Success!`);
      } else if (result.reason === 'no_events' ||
                 result.reason === 'unsupported_platform' ||
                 result.reason === 'unknown_status' ||
                 result.reason === 'live_scraper_not_implemented') {
        skipCount++;
        console.log(`⏭️  Skipped: ${result.reason}`);
      } else {
        failCount++;
        console.log(`❌ Failed: ${result.reason}`);
      }

    } catch (error) {
      failCount++;
      console.error(`❌ Error: ${error.message}`);
    }

    // Wait between meets to avoid overwhelming servers
    if (i < meets.length - 1) {
      console.log('\n⏳ Waiting 3 seconds before next meet...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total meets processed: ${meets.length}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`⏭️  Skipped: ${skipCount}`);
  console.log('='.repeat(60) + '\n');
}

// Main execution
scrapeAllUpcomingMeets()
  .then(() => {
    console.log('🎉 Batch scraping complete!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('🚨 Fatal error:', error);
    process.exit(1);
  });
