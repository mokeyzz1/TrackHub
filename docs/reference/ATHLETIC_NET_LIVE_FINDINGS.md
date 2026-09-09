# Athletic.net Live Integration Research

## Key Findings

### 🔍 What We Discovered

1. **NO WebSockets** - They don't use WebSocket connections for live data
2. **Elasticsearch Backend** - Uses Elasticsearch with index: `live_results`
3. **Angular App** - Frontend is built with Angular 9.x
4. **Config-based** - Loads configuration from JSON files

### 📡 How Athletic.net Live Works

Based on our analysis of `https://live.athletic.net/meets/59274`:

**Architecture:**
```
Athletic.net Live (Angular App)
    ↓
Elasticsearch Index: "live_results"
    ↓
Live meet data
```

**Key Endpoints Found:**
- Config: `https://livestatic.athletic.net/assets/sites/base-site/config.json`
- Config: `https://livestatic.athletic.net/assets/sites/athleticlive/config.json`
- Domain: `https://edge.athletic.net` (likely API server)

**Data Structure:**
- Elasticsearch index: `live_results`
- Primary domain: `https://live.athletic.net`
- Machine ID: `athleticlive`

### 💡 How to Get Live Data

Since they use Elasticsearch, they likely:

**Option A: Polling Elasticsearch**
- The Angular app polls an Elasticsearch API endpoint
- Queries the `live_results` index for meet ID 59274
- Updates UI when new results appear

**Option B: HTTP Long Polling**
- Keep connection open, server pushes updates
- When new result comes in, connection closes with data
- Client reconnects immediately

### 🎯 Next Steps for Integration

#### Approach 1: Reverse Engineer Elasticsearch API ✅ (Recommended)
Need to find:
- The actual Elasticsearch query endpoint (likely on `edge.athletic.net`)
- Authentication/API key requirements
- Query format for specific meet IDs

**How to find it:**
1. Wait for a LIVE meet (not past meet)
2. Run our script again during live meet
3. Capture the Elasticsearch API calls
4. Document the query format

#### Approach 2: Scrape the Rendered Page
- Less ideal but works
- Poll the page HTML every 10-30 seconds
- Parse results from DOM
- Display in our UI

#### Approach 3: WebView (Quick Solution)
- Embed their page in a WebView
- Style it with custom header/footer
- Works immediately, no reverse engineering

### 📋 What We Need

**For Live Meet Testing:**
- URL of an **active live meet** (not a past meet)
- This will show us the actual data requests

**For Full Integration:**
- Figure out the Elasticsearch API endpoint
- Understand authentication
- Build query for specific meet ID
- Create real-time polling system

### 🚀 Immediate Action Plan

1. **Get a live meet URL** - From this week's meets
2. **Run analysis during live meet** - Capture active data requests
3. **Find Elasticsearch endpoint** - Document API structure
4. **Build prototype** - Simple polling integration
5. **Create custom UI** - Beautiful results display

---

## Technical Details

**Files Generated:**
- `analyze_athletic_net.js` - Puppeteer script to analyze pages
- `athletic_net_requests.json` - Full request log
- This findings document

**Domains Involved:**
- `live.athletic.net` - Main live results site
- `livestatic.athletic.net` - Static assets/config
- `edge.athletic.net` - API server (likely)
- `alivestatic.athletic.net` - Additional assets

**No WebSocket** = We need to use **polling** or find their **Elasticsearch REST API**
