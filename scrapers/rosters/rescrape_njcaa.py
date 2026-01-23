#!/usr/bin/env python3
"""
Re-scrape NJCAA schools with correct jcollege URL pattern
Reads existing NJCAA files from output/NJCAA/ folder
"""

import sys
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path to import from scrape_rosters
sys.path.insert(0, str(Path(__file__).parent))

from scrape_rosters import TFRRSRosterScraper, logger, OUTPUT_DIR

def main():
    logger.info("=" * 60)
    logger.info("Re-scraping NJCAA Schools Only")
    logger.info("=" * 60)

    scraper = TFRRSRosterScraper()

    # Get NJCAA schools from existing files
    njcaa_folder = OUTPUT_DIR / "NJCAA"
    njcaa_files = sorted(njcaa_folder.glob("*.json"))

    logger.info(f"Found {len(njcaa_files)} NJCAA school files to re-scrape")

    # Read school info from existing files
    njcaa_schools = []
    for file in njcaa_files:
        with open(file, 'r') as f:
            school_data = json.load(f)
            njcaa_schools.append({
                'school_id': school_data['school_id'],
                'official_name': school_data['school_name'],
                'state': school_data['state'],
                'division': 'NJCAA'
            })

    # Scrape each NJCAA school
    for idx, school in enumerate(njcaa_schools, 1):
        school_id = school['school_id']
        school_name = school['official_name']

        logger.info(f"\n[{idx}/{len(njcaa_schools)}] Processing: {school_name}")

        try:
            # Scrape men's roster
            men_athletes = scraper.scrape_school_roster(school, 'M')
            scraper.smart_delay()

            # Scrape women's roster
            women_athletes = scraper.scrape_school_roster(school, 'F')
            scraper.smart_delay()

            # Store school data
            division = school['division']
            school_data = {
                'school_id': school_id,
                'school_name': school_name,
                'division': division,
                'state': school.get('state'),
                'men_roster': men_athletes,
                'women_roster': women_athletes,
                'total_athletes': len(men_athletes) + len(women_athletes),
                'scraped_at': datetime.now().isoformat()
            }

            # Save individual school file
            scraper.save_school_file(division, school_data)

            # Track progress
            scraper.divisions_data[division].append({
                'school_id': school_id,
                'school_name': school_name,
                'total_athletes': len(men_athletes) + len(women_athletes)
            })
            scraper.schools_processed.append(school_id)

            # Save checkpoint every 10 schools
            if idx % 10 == 0:
                total_athletes = sum(s.get('total_athletes', 0) for s in scraper.divisions_data['NJCAA'])
                scraper.save_checkpoint(school_id, total_athletes)
                logger.info(f"Checkpoint: {total_athletes} athletes from {idx} schools")

        except Exception as e:
            logger.error(f"Failed to process {school_name}: {e}")
            scraper.schools_failed.append({'school_id': school_id, 'error': str(e)})
            continue

    # Final summary
    total_athletes = sum(s.get('total_athletes', 0) for s in scraper.divisions_data['NJCAA'])
    logger.info("\n" + "=" * 60)
    logger.info("✅ NJCAA RE-SCRAPING COMPLETE!")
    logger.info(f"Total NJCAA athletes: {total_athletes}")
    logger.info(f"Schools processed: {len(scraper.schools_processed)}")
    logger.info(f"Schools failed: {len(scraper.schools_failed)}")
    logger.info("=" * 60)

if __name__ == "__main__":
    main()
