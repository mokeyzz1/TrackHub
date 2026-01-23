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

#### 6. Upload to Supabase (TODO)
```bash
python3 upload_to_supabase.py
```
(Script to be created after reviewing diff)

## Notes

- Always scrape to JSON first, never directly to database
- Review diff output before uploading to production
- Keep logs for debugging
- TFRRS athlete IDs are the stable identifier for matching
