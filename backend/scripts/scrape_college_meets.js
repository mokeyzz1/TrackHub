// Scrape COLLEGE meets specifically from USTFCCCA
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function scrapeCollegeMeets(datescope = 'this_week') {
  console.log(`\n🏛️  Scraping COLLEGE MEETS from USTFCCCA: ${datescope}\n`);

  const url = `https://www.ustfccca.org/meets-results?datescope=${datescope}`;

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('✅ Page loaded\n');

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Save the HTML for analysis
    const html = await page.content();
    fs.writeFileSync(`ustfccca_page_${datescope}.html`, html);
    console.log(`💾 Saved HTML to ustfccca_page_${datescope}.html\n`);

    // Extract ALL text content to see structure
    const pageData = await page.evaluate(() => {
      // Get all text content
      const bodyText = document.body.innerText;

      // Try to find headings
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
        tag: h.tagName,
        text: h.textContent.trim(),
        html: h.outerHTML.substring(0, 200)
      }));

      // Try to find any links that might be meets
      const links = Array.from(document.querySelectorAll('a')).map(a => ({
        text: a.textContent.trim(),
        href: a.href,
        classes: a.className
      })).filter(l => l.text.length > 0 && l.text.length < 200);

      // Look for elements containing "College" or "Indoor" or "Outdoor"
      const collegeElements = Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const text = el.textContent || '';
          return text.toLowerCase().includes('college') ||
                 text.toLowerCase().includes('indoor') ||
                 text.toLowerCase().includes('outdoor');
        })
        .slice(0, 20)
        .map(el => ({
          tag: el.tagName,
          text: el.textContent.substring(0, 150),
          classes: el.className
        }));

      return {
        bodyText: bodyText.substring(0, 5000),
        headings,
        linksCount: links.length,
        sampleLinks: links.slice(0, 20),
        collegeElements
      };
    });

    console.log('📋 Page Analysis:\n');
    console.log('='.repeat(80));

    console.log('\n🎯 Headings found:');
    pageData.headings.forEach((h, i) => {
      console.log(`${i + 1}. <${h.tag}> ${h.text}`);
    });

    console.log(`\n🔗 Found ${pageData.linksCount} total links`);
    console.log('\nSample links:');
    pageData.sampleLinks.slice(0, 10).forEach((l, i) => {
      console.log(`${i + 1}. ${l.text.substring(0, 60)}`);
      console.log(`   ${l.href}`);
    });

    console.log('\n🏛️  Elements containing "College/Indoor/Outdoor":');
    pageData.collegeElements.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tag}> ${el.text}`);
    });

    console.log('\n📄 Body text preview:');
    console.log(pageData.bodyText);
    console.log('='.repeat(80));

    // Save JSON
    const filename = `ustfccca_analysis_${datescope}_${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(pageData, null, 2));
    console.log(`\n💾 Saved analysis to: ${filename}\n`);

    return pageData;

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    throw error;
  } finally {
    await browser.close();
  }
}

// Run with different scopes
const scope = process.argv[2] || 'this_week';
scrapeCollegeMeets(scope).catch(console.error);
