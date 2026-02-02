/**
 * Test scraping profile photo from athletic.net
 */

const puppeteer = require('puppeteer');

async function testScrape() {
  const url = 'https://www.athletic.net/athlete/24195653/track-and-field/';

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  console.log('Loading page:', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for content to load
  await new Promise(r => setTimeout(r, 3000));

  // Look for profile image
  const data = await page.evaluate(() => {
    const result = {
      athleteImages: [],
      name: null,
      school: null,
      profilePhoto: null
    };

    // Get athlete name from title
    result.name = document.title.split(' - ')[0].trim();

    // Get all googleusercontent images with context
    document.querySelectorAll('img[src*="googleusercontent"]').forEach(img => {
      if (img.src) {
        const parent = img.closest('[class]');
        const parentClass = parent ? parent.className : '';
        const isTeamLogo = parentClass.includes('team-logo') || parentClass.includes('logo');

        result.athleteImages.push({
          src: img.src,
          srcLarge: img.src.replace(/=s\d+-p/, '=s400-p'),
          width: img.width,
          height: img.height,
          parentClass: parentClass.substring(0, 80),
          isTeamLogo: isTeamLogo
        });
      }
    });

    // Find profile photo - it's usually circular and NOT the team logo
    // Look for img near the athlete name/bio section
    const bioSection = document.querySelector('[class*="bio"], [class*="athlete-info"], [class*="profile"]');
    if (bioSection) {
      const bioImg = bioSection.querySelector('img[src*="googleusercontent"]:not([class*="logo"])');
      if (bioImg) {
        result.profilePhoto = bioImg.src.replace(/=s\d+-p/, '=s400-p');
      }
    }

    // Fallback: find non-logo googleusercontent image
    if (!result.profilePhoto) {
      const nonLogoImages = result.athleteImages.filter(img => !img.isTeamLogo);
      if (nonLogoImages.length > 0) {
        // Get the one that's not tiny (not 35x35 thumbnails)
        const profileImg = nonLogoImages.find(img => img.width >= 40 && img.width <= 200);
        if (profileImg) {
          result.profilePhoto = profileImg.srcLarge;
        }
      }
    }

    return result;
  });

  console.log('\n=== Results ===');
  console.log('Name:', data.name);
  console.log('Profile Photo:', data.profilePhoto || 'NO PROFILE PHOTO');
  console.log('\nAll athlete images (googleusercontent):');
  data.athleteImages.forEach((img, i) => {
    console.log(`  ${i + 1}. ${img.src}`);
    console.log(`     size: ${img.width}x${img.height}, parent: ${img.parentClass}`);
  });

  // Take screenshot for debugging
  await page.screenshot({ path: 'scrapers/tfrrs/output/test-athletic-net.png', fullPage: false });
  console.log('\nScreenshot saved to output/test-athletic-net.png');

  await browser.close();
}

testScrape().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
