# TFRRS Roster Update 2026

This folder contains all scripts and data for updating college track & field rosters for the 2026 season.

## Folder Structure

```
tfrrs_roster_update_2026/
├── scripts/           # Python scraping scripts
├── output/            # JSON output files (rosters, diffs)
├── logs/              # Scraping logs and progress
├── data/              # Baseline data for comparison
└── README.md          # This file
```

## Workflow

1. **Scrape** → Generate fresh roster JSON from TFRRS.org
2. **Diff** → Compare with existing data to identify changes
3. **Review** → Manually verify changes before uploading
4. **Upload** → Migrate approved changes to Supabase

## Key Files

- `scripts/scrape_rosters.py` - Main TFRRS scraper
- `output/rosters_2026_YYYY-MM-DD.json` - Full roster data
- `output/diff_2026_YYYY-MM-DD.json` - Changes only (new/transfers/updated/removed)
- `data/baseline_rosters.json` - Previous season data for comparison

## Usage

### Quick Start (Automated)

```bash
cd tfrrs_roster_update_2026/scripts
./run_full_workflow.sh
```

This runs all 3 steps automatically:
1. Export baseline
2. Scrape rosters (1-2 hours)
3. Generate diff

### Manual Steps

#### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

#### 2. Export Baseline from Database
```bash
cd scripts
python3 export_baseline.py
```
Creates `../data/baseline_rosters_latest.json` from current SQLite data.

#### 3. Scrape Fresh Rosters from TFRRS (2026 Indoor)
```bash
python3 scrape_rosters.py
```
- Scrapes all D1/D2/D3/NAIA/NJCAA schools
- Takes 1-2 hours for ~1,500 schools
- Progress auto-saves every 10 schools
- Can resume if interrupted (Ctrl+C safe)
- Output: `../output/rosters_2026_indoor_YYYY-MM-DD_HHMMSS.json`

#### 4. Generate Diff (Compare Old vs New)
```bash
python3 generate_diff.py
```
Output: `../output/diff_2026_indoor_YYYY-MM-DD_HHMMSS.json`

Shows:
- **Added**: New athletes not in baseline
- **Transfers**: Athletes who changed schools
- **Updated**: Field changes (class year, name corrections)
- **Removed**: Athletes missing from new scrape (graduated, left team)

#### 5. Review Diff
```bash
# View summary
cat ../output/diff_2026_indoor_*.json | jq '.metadata.summary'

# View transfers
cat ../output/diff_2026_indoor_*.json | jq '.transfers[] | {name, old_school_id, new_school_id}'

# View new athletes
cat ../output/diff_2026_indoor_*.json | jq '.added_athletes[] | {name, school_id, class_year}'
```

#### 6. Review and import collegiate roster evidence
```bash
node scrapers/rosters/import_collegiate_roster.js --input scrapers/rosters/output/rosters_2026_indoor_latest.json
node scrapers/rosters/import_collegiate_roster.js --input scrapers/rosters/output/rosters_2026_indoor_latest.json --commit
```

Run these commands from the repository root. Dry-run is the default. The commit path only accepts
rows with one exact TFRRS athlete ID (including reviewed identity mappings),
one canonical school/gender team, a verified collegiate school membership covering the season,
and the source TFRRS team URL. Accepted rows atomically upsert `athlete_team_seasons` and append
private `athlete_status_evidence`. Unknown athletes, duplicate IDs, clubs, unresolved schools,
changed source payloads, and contradictory rows are held rather than guessed.

The importer does not create athletes, change `athletes.school_id`, infer current eligibility,
professional/post-collegiate status, or publish resolved status periods. Those require their own
reviewed identity/resolution checkpoints.

`upload_to_supabase.js` and `fix_and_upload_new_athletes.js` are legacy one-season scripts. Do not
use them for new imports: they predate the atomic evidence model and the latter manually allocates
athlete IDs.

## Notes

- Always scrape to JSON first, never directly to database
- Review diff output before uploading to production
- Keep logs for debugging
- TFRRS athlete IDs are the stable identifier for matching
- TFRRS and Athletic.net IDs are separate provider namespaces; never compare their numeric values
