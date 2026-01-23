#!/usr/bin/env python3
"""
Generate Roster Diff
Compares new scraped rosters with baseline to identify changes:
- New athletes
- Transfers (school changes)
- Updated fields (class year, etc)
- Removed/missing athletes
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Set
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Get absolute paths relative to this script's location
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_DIR = PROJECT_ROOT / "output"


class RosterDiffGenerator:
    def __init__(self, baseline_file: Path, new_roster_file: Path):
        self.baseline_file = baseline_file
        self.new_roster_file = new_roster_file

        # Load data
        with open(baseline_file, 'r') as f:
            baseline_data = json.load(f)
            self.baseline_athletes = baseline_data['athletes']

        with open(new_roster_file, 'r') as f:
            new_data = json.load(f)
            self.new_athletes = new_data['athletes']

        # Index by TFRRS athlete ID (stable identifier)
        self.baseline_by_tfrrs_id = {
            a['tfrrs_athlete_id']: a
            for a in self.baseline_athletes
            if a.get('tfrrs_athlete_id')
        }

        self.new_by_tfrrs_id = {
            a['tfrrs_athlete_id']: a
            for a in self.new_athletes
            if a.get('tfrrs_athlete_id')
        }

        logger.info(f"Baseline athletes: {len(self.baseline_athletes)}")
        logger.info(f"New scraped athletes: {len(self.new_athletes)}")
        logger.info(f"Baseline with TFRRS ID: {len(self.baseline_by_tfrrs_id)}")
        logger.info(f"New with TFRRS ID: {len(self.new_by_tfrrs_id)}")

        # Diff results
        self.added_athletes = []
        self.transfers = []
        self.updated_fields = []
        self.removed_athletes = []

    def generate_diff(self):
        """Generate comprehensive diff between baseline and new roster"""
        baseline_ids = set(self.baseline_by_tfrrs_id.keys())
        new_ids = set(self.new_by_tfrrs_id.keys())

        # 1. NEW ATHLETES - in new scrape but not in baseline
        added_ids = new_ids - baseline_ids
        logger.info(f"\n📥 New athletes: {len(added_ids)}")

        for tfrrs_id in added_ids:
            new_athlete = self.new_by_tfrrs_id[tfrrs_id]
            self.added_athletes.append({
                'tfrrs_athlete_id': tfrrs_id,
                'full_name': new_athlete['full_name'],
                'school_id': new_athlete['school_id'],
                'class_year': new_athlete.get('class_year'),
                'gender': new_athlete['gender'],
                'tfrrs_profile_url': new_athlete['tfrrs_profile_url'],
                'reason': 'new_athlete',
                'scraped_at': new_athlete['scraped_at']
            })

        # 2. REMOVED/MISSING ATHLETES - in baseline but not in new scrape
        removed_ids = baseline_ids - new_ids
        logger.info(f"📤 Removed/missing athletes: {len(removed_ids)}")

        for tfrrs_id in removed_ids:
            old_athlete = self.baseline_by_tfrrs_id[tfrrs_id]
            self.removed_athletes.append({
                'tfrrs_athlete_id': tfrrs_id,
                'full_name': old_athlete['full_name'],
                'school_id': old_athlete['school_id'],
                'class_year': old_athlete.get('class_year'),
                'gender': old_athlete['gender'],
                'reason': 'not_in_new_scrape',
                'note': 'May have graduated, transferred, or left team'
            })

        # 3. TRANSFERS & UPDATES - in both but with changes
        common_ids = baseline_ids & new_ids
        logger.info(f"🔄 Athletes in both datasets: {len(common_ids)}")

        transfers_count = 0
        updates_count = 0

        for tfrrs_id in common_ids:
            old = self.baseline_by_tfrrs_id[tfrrs_id]
            new = self.new_by_tfrrs_id[tfrrs_id]

            changes = {}

            # Check for school change (TRANSFER)
            if old['school_id'] != new['school_id']:
                self.transfers.append({
                    'tfrrs_athlete_id': tfrrs_id,
                    'full_name': new['full_name'],
                    'old_school_id': old['school_id'],
                    'new_school_id': new['school_id'],
                    'class_year': new.get('class_year'),
                    'gender': new['gender'],
                    'tfrrs_profile_url': new['tfrrs_profile_url'],
                    'reason': 'transfer'
                })
                transfers_count += 1
                continue  # Don't check other fields if it's a transfer

            # Check for other field changes
            if old.get('class_year') != new.get('class_year'):
                changes['class_year'] = {
                    'old': old.get('class_year'),
                    'new': new.get('class_year')
                }

            if old.get('full_name') != new.get('full_name'):
                changes['full_name'] = {
                    'old': old.get('full_name'),
                    'new': new.get('full_name')
                }

            # If any changes, record them
            if changes:
                self.updated_fields.append({
                    'tfrrs_athlete_id': tfrrs_id,
                    'full_name': new['full_name'],
                    'school_id': new['school_id'],
                    'gender': new['gender'],
                    'changes': changes,
                    'reason': 'field_update'
                })
                updates_count += 1

        logger.info(f"  ↔️  Transfers: {transfers_count}")
        logger.info(f"  ✏️  Field updates: {updates_count}")

    def save_diff(self) -> Path:
        """Save diff results to JSON"""
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y-%m-%d_%H%M%S')
        diff_file = OUTPUT_DIR / f"diff_2026_indoor_{timestamp}.json"

        diff_data = {
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'baseline_file': str(self.baseline_file.name),
                'new_roster_file': str(self.new_roster_file.name),
                'baseline_count': len(self.baseline_athletes),
                'new_roster_count': len(self.new_athletes),
                'summary': {
                    'added': len(self.added_athletes),
                    'transfers': len(self.transfers),
                    'updated': len(self.updated_fields),
                    'removed': len(self.removed_athletes)
                }
            },
            'added_athletes': self.added_athletes,
            'transfers': self.transfers,
            'updated_fields': self.updated_fields,
            'removed_athletes': self.removed_athletes
        }

        with open(diff_file, 'w') as f:
            json.dump(diff_data, f, indent=2)

        logger.info(f"\n✅ Diff saved to: {diff_file}")

        # Print summary
        logger.info("\n" + "=" * 60)
        logger.info("DIFF SUMMARY")
        logger.info("=" * 60)
        logger.info(f"📥 New athletes: {len(self.added_athletes)}")
        logger.info(f"↔️  Transfers: {len(self.transfers)}")
        logger.info(f"✏️  Updated fields: {len(self.updated_fields)}")
        logger.info(f"📤 Removed/missing: {len(self.removed_athletes)}")
        logger.info("=" * 60)

        # Show sample transfers if any
        if self.transfers:
            logger.info("\nSample transfers:")
            for transfer in self.transfers[:5]:
                logger.info(f"  - {transfer['full_name']}: School {transfer['old_school_id']} → {transfer['new_school_id']}")

        # Show sample new athletes if any
        if self.added_athletes:
            logger.info("\nSample new athletes:")
            for athlete in self.added_athletes[:5]:
                logger.info(f"  - {athlete['full_name']} ({athlete.get('class_year', 'N/A')}) - School {athlete['school_id']}")

        return diff_file


def main():
    """Main entry point"""
    logger.info("=" * 60)
    logger.info("ROSTER DIFF GENERATOR - 2026 Indoor Season")
    logger.info("=" * 60)

    # Find latest files
    baseline_file = DATA_DIR / "baseline_rosters_latest.json"
    if not baseline_file.exists():
        logger.error(f"❌ Baseline file not found: {baseline_file}")
        logger.info("Run export_baseline.py first to create baseline data")
        return

    # Find most recent roster file
    roster_files = sorted(OUTPUT_DIR.glob("rosters_2026_indoor_*.json"))
    if not roster_files:
        logger.error(f"❌ No roster files found in {OUTPUT_DIR}")
        logger.info("Run scrape_rosters.py first to scrape new roster data")
        return

    new_roster_file = roster_files[-1]  # Most recent

    logger.info(f"\nBaseline: {baseline_file}")
    logger.info(f"New roster: {new_roster_file}")

    # Generate diff
    diff_gen = RosterDiffGenerator(baseline_file, new_roster_file)
    diff_gen.generate_diff()
    diff_file = diff_gen.save_diff()

    logger.info(f"\n✅ Diff generation complete!")
    logger.info(f"Review the diff file before uploading to Supabase:")
    logger.info(f"  {diff_file}")


if __name__ == "__main__":
    main()
