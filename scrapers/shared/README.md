# Shared Utilities

Shared code used across multiple scrapers.

## Ingestion boundary

All new result sources must be translated into the canonical contract in
`ingestion_contract.js` before a writer can consider a database change. The contract separates:

- source identity (`source_record_key`), which makes replays idempotent;
- canonical identity (`performance_key` / `canonical_key`), which is used for matching;
- measurement type (`time`, `distance`, or `points`), which prevents multi-event component marks
  from being ranked as aggregate points; and
- validation errors, which send uncertain rows to quarantine instead of guessing.

`result_matcher.js` returns one of `insert`, `claim`, `skip_duplicate`, or `quarantine`. It does not
delete rows or choose between conflicting source values.

The private PostgreSQL control plane is defined in
`supabase/migrations/20260819204028_create_ingestion_control_plane.sql` and written through
`ingestion_store.js`. It records runs, source records, observations, provenance links, and
quarantine decisions. The migration has been applied to the live Supabase project; no fact rows
are written by that migration.

`canonical_fact_writer.js` is the only controlled-mode writer for `results`, `relay_results`,
`relay_athletes`, and `ingest.source_links`. `controlled_ingestion.js` records the run lifecycle,
and `source_observation_adapter.js` is the common seam between TFRRS and athletic.net field
shapes.

Controlled mode is opt-in until the database URL secret is installed and a cached meet passes the
end-to-end verification:

```sh
INGEST_DATABASE_URL='postgresql://...' node athletic-net/import_meet_results.js <meet_id> --json cached.json --control-plane
INGEST_DATABASE_URL='postgresql://...' node athletic-net/import_meet_results.js <meet_id> --json cached.json --commit --control-plane
node tfrrs/meet-scraper/sync-weekend-results.js --meet <meet_id> --scrape --control-plane
```

## Recovery queue

Before scraping a historical window, refresh the private queue. This measures individual and relay
coverage plus supported TFRRS/athletic.net links; it does not scrape, claim, insert, or delete facts:

```sh
INGEST_DATABASE_URL='postgresql://...' node recovery/refresh_recovery_queue.js \
  --scope 2025-26 --from 2025-08-01 --to 2026-07-31
```

The queue is resumable and intentionally separates `covered`, `queued`, and `blocked` meets. A
generic timing-site URL is not treated as a supported result source unless its host verifies as
TFRRS or athletic.net.

Run a bounded recovery dry run after refreshing the queue. It only selects validated TFRRS or
athletic.net candidates, claims one queue row at a time, persists the controlled observations, and
returns the row to `queued` for review. It never commits public facts:

```sh
INGEST_DATABASE_URL='postgresql://...' node recovery/run_recovery_batch.js \
  --scope 2025-26 --limit 3
```

Rows with unsupported timing-site URLs remain queued for a dedicated adapter. Use `--meet <id>`
to inspect one meet and `--source tfrrs` or `--source athletic_net` only when the queue has that
validated source candidate. `--limit` counts supported candidates, so generic URLs do not consume
batch capacity; untouched rows are prioritized ahead of previous attempts. The runner rejects
`--commit` by design; reviewed writes remain an
explicit per-meet operation until all source-specific athlete creation paths are behind the
canonical writer. Abandoned `in_progress` leases older than 30 minutes are returned to `queued`
automatically; adjust that recovery window with `--stale-minutes`.

The private writer requires an explicit server-side PostgreSQL connection in
`INGEST_DATABASE_URL`. It deliberately does not fall back to `DATABASE_URL` or
`SUPABASE_DB_URL`, because a generic application URL can point at a developer database or another
service. The public Supabase URL and anon key are not valid substitutes because the `ingest` schema
is intentionally not exposed to the Data API.

## Contents

### `athlete_matcher.js`

Matches scraped athlete names to `athlete_id` in the database.

#### How It Works

1. Takes raw athlete name + team from scraper
2. Searches athletes table by name similarity
3. Filters by team/school match
4. Returns best match with confidence score

#### Usage

```javascript
const { AthleteMatcher } = require('../shared/athlete_matcher');

const matcher = new AthleteMatcher();

// Match entries for a meet
const result = await matcher.matchEntries(meetId);
console.log(`Matched ${result.matched} of ${result.total} entries`);

// Match single athlete
const athleteId = await matcher.findAthlete('John Smith', 'University of Example');
```

#### Match Algorithm

```
1. Normalize names (lowercase, remove accents, handle suffixes)
2. Search by last name in athletes table
3. Score candidates by:
   - First name similarity (Levenshtein distance)
   - Team name match
   - School match
4. Return best match if confidence > threshold
```

### `ingestion_contract.js`

Pure normalization and validation for source rows. It is the only place that should create a
source record key or canonical performance key.

### `result_matcher.js`

Pure, deterministic matching policy. It requires an exact canonical match for an automatic skip;
same mark with conflicting place or multiple history candidates is quarantined.

### `ingestion_store.js`

Transactional PostgreSQL writer for the private `ingest` schema. It requires the explicit
`INGEST_DATABASE_URL` variable; it is intentionally not a client-side Supabase Data API utility.

### `sql/`

Database migrations and schema files.

| File | Purpose |
|------|---------|
| `001_schema_updates.sql` | Initial schema for meet_entries, live_results |
| `run_migrations.js` | Migration runner script |

#### Running Migrations

Migrations should be run directly in Supabase SQL Editor:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Open SQL Editor
3. Copy/paste the SQL file contents
4. Execute

## Environment Variables

All shared utilities expect these environment variables (from `.env` at project root):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
```

## Adding Shared Code

When adding new shared utilities:

1. Create file in `shared/`
2. Export functions/classes
3. Import in scrapers with `require('../shared/filename')`
4. Document usage in this README
