// Debug scraper - see what the page actually contains
const puppeteer = require('puppeteer');

async function debugPage() {
  console.log('\n🔍 Debugging USTFCCCA page structure...\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    await page.goto('https://www.ustfccca.org/meets-results?datescope=this_week', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('✅ Page loaded\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const debug = await page.evaluate(() => {
      // Find all tables
      const allTables = document.querySelectorAll('table');
      console.log(`Found ${allTables.length} tables`);

      // Find "Collegiate" headings
      const collegiateHeadings = Array.from(document.querySelectorAll('h4'))
        .filter(h => h.textContent.trim() === 'Collegiate');

      console.log(`Found ${collegiateHeadings.length} Collegiate headings`);

      if (collegiateHeadings.length === 0) {
        return {
          error: 'No Collegiate headings found',
          allH4s: Array.from(document.querySelectorAll('h4')).map(h => h.textContent.trim())
        };
      }

      // Get the first collegiate section
      const firstCollegiate = collegiateHeadings[0];

      // Find the next table after this heading
      let nextElement = firstCollegiate.nextElementSibling;
      let table = null;

      while (nextElement && !table) {
        if (nextElement.tagName === 'TABLE') {
          table = nextElement;
          break;
        }
        if (nextElement.tagName === 'H3' || nextElement.tagName === 'H2') {
          // Reached next section
          break;
        }
        nextElement = nextElement.nextElementSibling;
      }

      if (!table) {
        return {
          error: 'No table found after Collegiate heading'
        };
      }

      // Get first 3 rows from this table
      const rows = table.querySelectorAll('tbody tr');
      const sampleMeets = [];

      for (let i = 0; i < Math.min(3, rows.length); i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');

        sampleMeets.push({
          cellCount: cells.length,
          cell0HTML: cells[0] ? cells[0].innerHTML.substring(0, 300) : '',
          cell1HTML: cells[1] ? cells[1].innerHTML.substring(0, 300) : '',
          cell2HTML: cells[2] ? cells[2].innerHTML.substring(0, 300) : '',
          cell0Text: cells[0] ? cells[0].textContent.trim().substring(0, 100) : '',
          cell1Text: cells[1] ? cells[1].textContent.trim().substring(0, 100) : '',
          cell2Text: cells[2] ? cells[2].textContent.trim().substring(0, 100) : ''
        });
      }

      return {
        success: true,
        totalTables: allTables.length,
        collegiateHeadings: collegiateHeadings.length,
        tableClass: table.className,
        rowsInTable: rows.length,
        sampleMeets
      };
    });

    console.log('='.repeat(80));
    console.log(JSON.stringify(debug, null, 2));
    console.log('='.repeat(80));

    console.log('\n👀 Browser window will stay open for 30 seconds for you to inspect...\n');
    await new Promise(resolve => setTimeout(resolve, 30000));

    await browser.close();

  } catch (error) {
    console.error('Error:', error);
    await browser.close();
  }
}

debugPage();
