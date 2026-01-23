# Backend - Track Meet Tracker

This directory contains all backend services, data scraping scripts, and Supabase configuration.

## Structure

```
backend/
├── supabase/              # Supabase configuration
│   ├── functions/         # Edge Functions (Deno/TypeScript)
│   └── migrations/        # PostgreSQL migrations
├── server/                # Optional API server
└── scripts/               # Data collection and migration
    ├── *.py              # Python scraping scripts
    ├── data/             # Scraped JSON data
    ├── database/         # Database utilities
    └── track_hub.db      # SQLite database (legacy)
```

## Scripts Overview

### Data Collection Scripts

- `scrape_rosters.py` - Scrapes athlete rosters from TFRRS
- `scrape_results.py` - Scrapes meet results from TFRRS
- `tfrrs_scraper.py` - Main TFRRS scraping utility
- `logo_collector.py` - Collects school logos

### Data Processing Scripts

- `complete_rosters.py` - Processes and completes roster data
- `improve_database_structure.py` - Database optimization
- `standardize_discipline_values.py` - Standardizes event names
- Various `assign_*.py` - Conference/region assignments

### Migration Scripts (to be created)

- `migrate_to_postgres.py` - SQLite → PostgreSQL migration
- `verify_migration.py` - Validate data transfer

## Supabase Setup

### Prerequisites

1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Initialize Supabase (if not done):
```bash
cd backend
supabase init
```

3. Link to your Supabase project:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### Database Migrations

Create and run migrations:

```bash
# Create new migration
supabase migration new create_tables

# Run migrations locally
supabase db reset

# Push to production
supabase db push
```

### Edge Functions

Create and deploy Edge Functions:

```bash
# Create function
supabase functions new scrape-meets

# Test locally
supabase functions serve scrape-meets

# Deploy
supabase functions deploy scrape-meets
```

## Environment Variables

Create a `.env` file in the backend directory:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Database
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres
```

## Python Environment

### Setup

```bash
cd scripts
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Dependencies

Main packages:
- `beautifulsoup4` - HTML parsing
- `selenium` - Browser automation
- `requests` - HTTP requests
- `psycopg2-binary` - PostgreSQL adapter
- `python-dotenv` - Environment variables

## Data Migration Process

### Phase 1: Schema Creation

1. Analyze SQLite schema
2. Create equivalent PostgreSQL schema
3. Add indexes and constraints
4. Create migration file

### Phase 2: Data Transfer

1. Export SQLite data to CSV/JSON
2. Transform data for PostgreSQL
3. Bulk import using COPY command
4. Verify data integrity

### Phase 3: Validation

1. Count records in both databases
2. Spot-check athlete/result data
3. Test all app queries
4. Performance benchmarking

## Current Database Stats

- **Results:** 2.2M+ records
- **Athletes:** Active roster data across all divisions
- **Schools:** D1, D2, D3, NAIA, NJCAA
- **Conferences:** Full conference assignments
- **Meet Data:** Historical meet information

## Athletic.net Live Integration

### Research Status

Analysis complete (see `scripts/ATHLETIC_NET_LIVE_FINDINGS.md`):
- Uses Elasticsearch backend (`live_results` index)
- No WebSocket connections
- Likely uses polling or Server-Sent Events
- Need active live meet to capture API endpoints

### Next Steps

1. Find active live meet URL
2. Capture API requests during live meet
3. Document Elasticsearch API structure
4. Build Edge Function to fetch live data
5. Set up real-time subscriptions in app

## Development Workflow

### Testing Scraper Locally

```bash
cd scripts
source .venv/bin/activate
python scrape_rosters.py --school-id 123 --season 2024-2025
```

### Testing Edge Function Locally

```bash
cd backend
supabase functions serve --env-file .env.local
```

### Deploying Updates

```bash
# Database changes
supabase db push

# Edge Functions
supabase functions deploy scrape-meets

# Check logs
supabase functions logs scrape-meets
```

## Monitoring

### Database Performance

```sql
-- Check slow queries
SELECT * FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname = 'public';
```

### Edge Function Logs

```bash
# Real-time logs
supabase functions logs scrape-meets --tail

# Recent errors
supabase functions logs scrape-meets --level error
```

## Future Enhancements

- [ ] Automated daily roster updates
- [ ] Live meet result streaming
- [ ] Athlete performance analytics
- [ ] School ranking calculations
- [ ] Meet entry scraping
- [ ] Push notifications for live results
