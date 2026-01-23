#!/usr/bin/env python3
"""
Consolidate Individual School Rosters
Combines all individual school roster JSON files into one consolidated file for diff generation
"""

import json
from datetime import datetime
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_ROOT / "output"

def consolidate_rosters():
    """Read all individual school files and consolidate into one roster file"""
    all_athletes = []
    school_count = 0

    # Process each division folder
    divisions = ['DI', 'DII', 'DIII', 'NAIA', 'NJCAA']

    for division in divisions:
        division_dir = OUTPUT_DIR / division
        if not division_dir.exists():
            logger.warning(f"Division folder not found: {division_dir}")
            continue

        school_files = sorted(division_dir.glob("*.json"))
        logger.info(f"Processing {division}: {len(school_files)} schools")

        for school_file in school_files:
            try:
                with open(school_file, 'r') as f:
                    school_data = json.load(f)

                school_id = school_data['school_id']
                school_name = school_data['school_name']
                scraped_at = school_data['scraped_at']

                # Process men's roster
                for athlete in school_data.get('men_roster', []):
                    athlete['school_id'] = school_id
                    athlete['school_name'] = school_name
                    athlete['gender'] = 'M'
                    athlete['division'] = division
                    athlete['scraped_at'] = scraped_at
                    all_athletes.append(athlete)

                # Process women's roster
                for athlete in school_data.get('women_roster', []):
                    athlete['school_id'] = school_id
                    athlete['school_name'] = school_name
                    athlete['gender'] = 'F'
                    athlete['division'] = division
                    athlete['scraped_at'] = scraped_at
                    all_athletes.append(athlete)

                school_count += 1

            except Exception as e:
                logger.error(f"Error processing {school_file}: {e}")
                continue

    logger.info(f"\n✅ Consolidated {len(all_athletes)} athletes from {school_count} schools")

    # Save consolidated file
    timestamp = datetime.now().strftime('%Y-%m-%d_%H%M%S')
    consolidated_file = OUTPUT_DIR / f"rosters_2026_indoor_{timestamp}.json"

    with open(consolidated_file, 'w') as f:
        json.dump({
            'metadata': {
                'season': '2026 Indoor',
                'consolidated_at': datetime.now().isoformat(),
                'total_athletes': len(all_athletes),
                'total_schools': school_count
            },
            'athletes': all_athletes
        }, f, indent=2)

    logger.info(f"✅ Saved to: {consolidated_file}")

    # Also save as 'latest' for easy reference
    latest_file = OUTPUT_DIR / "rosters_2026_indoor_latest.json"
    with open(latest_file, 'w') as f:
        json.dump({
            'metadata': {
                'season': '2026 Indoor',
                'consolidated_at': datetime.now().isoformat(),
                'total_athletes': len(all_athletes),
                'total_schools': school_count
            },
            'athletes': all_athletes
        }, f, indent=2)

    logger.info(f"✅ Also saved as: {latest_file}")

    return consolidated_file

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("CONSOLIDATING INDIVIDUAL SCHOOL ROSTERS")
    logger.info("=" * 60)
    consolidate_rosters()
