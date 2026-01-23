// Detect the current status of a meet (upcoming, live, completed)
const puppeteer = require('puppeteer');

/**
 * Detect meet status by analyzing the page content
 * @param {string} meetUrl - URL of the meet
 * @returns {Promise<{status: string, completedEvents: number, totalEvents: number, platform: string}>}
 */
async function detectMeetStatus(meetUrl) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Detect platform
    const platform = detectPlatform(meetUrl);

    console.log(`🔍 Detecting status for ${platform} meet...`);

    await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    let meetStatus;

    if (platform === 'milesplit') {
      meetStatus = await detectMileSplitStatus(page);
    } else if (platform === 'athletic_net') {
      meetStatus = await detectAthleticNetStatus(page);
    } else if (platform === 'jdl') {
      meetStatus = await detectJDLStatus(page);
    } else {
      meetStatus = {
        status: 'unknown',
        completedEvents: 0,
        totalEvents: 0,
        confidence: 'low'
      };
    }

    await browser.close();

    return {
      ...meetStatus,
      platform
    };

  } catch (error) {
    await browser.close();
    throw error;
  }
}

// Detect platform from URL
function detectPlatform(url) {
  if (url.includes('athletic.net')) return 'athletic_net';
  if (url.includes('milesplit')) return 'milesplit';
  if (url.includes('jdlfasttrack.com')) return 'jdl';
  if (url.includes('tfrrs.org')) return 'tfrrs';
  if (url.includes('leonetiming.com')) return 'leon_timing';
  if (url.includes('flashresults.com')) return 'flashresults';
  // Black Squirrel Timing uses Athletic.net's platform
  if (url.includes('blacksquirreltiming.com')) return 'athletic_net';
  if (url.includes('lancertiming.com')) return 'lancer';
  return 'unknown';
}

// Detect MileSplit meet status
async function detectMileSplitStatus(page) {
  const statusInfo = await page.evaluate(() => {
    const eventDivs = document.querySelectorAll('.event-component');
    let completedCount = 0;
    let liveCount = 0;
    let upcomingCount = 0;
    const totalCount = eventDivs.length;

    eventDivs.forEach(div => {
      const text = div.textContent.toLowerCase();

      // Check for "Completed" keyword
      if (text.includes('completed')) {
        completedCount++;
      }
      // Check for "Live" or "In Progress" indicators
      else if (text.includes('live') || text.includes('in progress')) {
        liveCount++;
      }
      // Otherwise it's upcoming
      else {
        upcomingCount++;
      }
    });

    // Determine overall meet status
    let status = 'upcoming';
    let confidence = 'high';

    if (completedCount === totalCount && totalCount > 0) {
      status = 'completed';
    } else if (liveCount > 0 || (completedCount > 0 && completedCount < totalCount)) {
      status = 'live';
    } else if (upcomingCount === totalCount) {
      status = 'upcoming';
    } else if (totalCount === 0) {
      status = 'unknown';
      confidence = 'low';
    }

    return {
      status,
      completedEvents: completedCount,
      liveEvents: liveCount,
      upcomingEvents: upcomingCount,
      totalEvents: totalCount,
      confidence
    };
  });

  return statusInfo;
}

// Detect Athletic.net meet status
async function detectAthleticNetStatus(page) {
  const statusInfo = await page.evaluate(() => {
    // Look for status indicators in Athletic.net
    const statusElements = document.querySelectorAll('[class*="status"], [class*="complete"], [class*="live"]');
    const eventRows = document.querySelectorAll('[class*="event"]');

    let completedCount = 0;
    let totalCount = eventRows.length;

    statusElements.forEach(el => {
      const text = el.textContent.toLowerCase();
      if (text.includes('completed') || text.includes('final')) {
        completedCount++;
      }
    });

    let status = 'upcoming';
    if (completedCount === totalCount && totalCount > 0) {
      status = 'completed';
    } else if (completedCount > 0) {
      status = 'live';
    }

    return {
      status,
      completedEvents: completedCount,
      totalEvents: totalCount,
      confidence: totalCount > 0 ? 'medium' : 'low'
    };
  });

  return statusInfo;
}

// Detect JDL FastTrack meet status
async function detectJDLStatus(page) {
  const statusInfo = await page.evaluate(() => {
    // JDL has real-time updates, look for live indicators
    const body = document.body.textContent.toLowerCase();

    let status = 'upcoming';
    let confidence = 'medium';

    if (body.includes('live results') || body.includes('current results')) {
      status = 'live';
      confidence = 'high';
    } else if (body.includes('final results') || body.includes('meet complete')) {
      status = 'completed';
      confidence = 'high';
    }

    return {
      status,
      completedEvents: 0,
      totalEvents: 0,
      confidence
    };
  });

  return statusInfo;
}

// Main execution when run directly
async function main() {
  const meetUrl = process.argv[2];

  if (!meetUrl) {
    console.error('Usage: node detect_meet_status.js <meet_url>');
    process.exit(1);
  }

  console.log(`\n🔍 MEET STATUS DETECTOR\n`);
  console.log('='.repeat(60));

  const result = await detectMeetStatus(meetUrl);

  console.log('\n📊 Status Detection Results:');
  console.log('='.repeat(60));
  console.log(`Platform: ${result.platform}`);
  console.log(`Status: ${result.status.toUpperCase()}`);
  console.log(`Confidence: ${result.confidence}`);
  console.log(`\nEvents:`);
  console.log(`  Total: ${result.totalEvents}`);
  console.log(`  Completed: ${result.completedEvents}`);
  if (result.liveEvents !== undefined) {
    console.log(`  Live: ${result.liveEvents}`);
    console.log(`  Upcoming: ${result.upcomingEvents}`);
  }
  console.log('='.repeat(60));

  console.log('\n💡 Recommended Action:');
  if (result.status === 'upcoming') {
    console.log('   → Scrape STARTING LISTS / ENTRIES (event_entries table)');
  } else if (result.status === 'live') {
    console.log('   → Scrape LIVE RESULTS (live_results table)');
  } else if (result.status === 'completed') {
    console.log('   → Scrape FINAL RESULTS (live_results table with final=true)');
  } else {
    console.log('   → Status unclear, manual inspection needed');
  }
  console.log('='.repeat(60) + '\n');
}

// Export for use in other scripts
module.exports = {
  detectMeetStatus,
  detectPlatform
};

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}
