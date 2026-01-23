# Platform Scrapers

Shared scraper modules for different timing platforms. Used by entries, live, and final scrapers.

## Available Platforms

### Athletic.net (`athletic_net.js`)

Handles the Athletic.net family of timing sites:

| Site | URL Pattern | Status |
|------|-------------|--------|
| Athletic.net | athletic.net/TrackAndField/meet/* | ✅ |
| Live Athletic.net | live.athletic.net/meets/* | ✅ |
| JDL FastTrack | live.jdlfasttrack.com/meets/* | ✅ |
| BlackSquirrel Timing | results.blacksquirreltiming.com/* | ✅ |

#### Usage

```javascript
const { AthleticNetScraper } = require('../platforms/athletic_net');

const scraper = new AthleticNetScraper({ headless: true });

// Scrape entries
const meetData = await scraper.scrapeMeet(url, 'entries');

// Scrape live/final results
const meetData = await scraper.scrapeMeet(url, 'results');

// Poll single event
const eventData = await scraper.pollEvent(eventUrl);

await scraper.close();
```

#### CLI Testing

```bash
cd scrapers

# Test entries mode
node platforms/athletic_net.js https://www.athletic.net/TrackAndField/meet/123456 entries

# Test results mode
node platforms/athletic_net.js https://live.athletic.net/meets/54321 results
```

#### Modes

| Mode | Purpose | Returns |
|------|---------|---------|
| `entries` | Pre-meet entries | `{ events: [{ name, entries: [...] }] }` |
| `results` | Live/final results | `{ events: [{ name, results: [...] }] }` |

## Adding New Platforms

To add support for a new timing platform:

1. Create `<platform_name>.js` in this folder
2. Export a class with these methods:
   - `constructor(options)` - Initialize with headless, timeout options
   - `scrapeMeet(url, mode)` - Scrape full meet (entries or results)
   - `close()` - Clean up browser instance
3. Add platform to `entries_scraper.js` and `live_scraper.js`

### Template

```javascript
const puppeteer = require('puppeteer');

class NewPlatformScraper {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.timeout = options.timeout || 60000;
    this.browser = null;
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: this.headless ? 'new' : false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  async scrapeMeet(url, mode = 'results') {
    if (!this.browser) await this.init();
    // ... scraping logic
    return { meet_name, meet_url, events: [...] };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = { NewPlatformScraper };
```

## Platform Status

| Platform | Entries | Live | Final | Priority |
|----------|---------|------|-------|----------|
| Athletic.net | ✅ | ✅ | ✅ | Done |
| TFRRS | - | - | ✅ | Done (in final/) |
| MileSplit | ❌ | ❌ | ❌ | High |
| PT Timing | ❌ | ❌ | ❌ | Medium |
| Finish Timing | ❌ | ❌ | ❌ | Medium |
