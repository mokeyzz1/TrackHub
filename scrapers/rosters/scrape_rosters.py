#!/usr/bin/env python3
"""
TFRRS Roster Scraper for 2026 Indoor Season
Scrapes all NCAA D1/D2/D3/NAIA/NJCAA rosters and outputs to JSON
"""

import re
import json
import time
import random
import sqlite3
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional
import logging
import asyncio
from playwright.async_api import async_playwright

# Configure logging
import os
SCRIPT_DIR = Path(__file__).parent
LOG_DIR = SCRIPT_DIR.parent / 'logs'
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / 'scrape_rosters.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Configuration
SQLITE_DB_PATH = SCRIPT_DIR.parent.parent / "backend/server/track_hub.db"
OUTPUT_DIR = SCRIPT_DIR.parent / "output"
CHECKPOINT_FILE = LOG_DIR / "checkpoint.json"
SEASON = "2026 Indoor"
BASE_DELAY = 5  # base seconds between requests
RANDOM_JITTER = 3  # add random 0-3 seconds
BACKOFF_403_DELAY = 30  # wait 30s after 403 error
MAX_RETRIES = 3

# Rotate user agents to avoid detection
USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
]
HEADERS = {
    'User-Agent': USER_AGENTS[0]
}


class TFRRSRosterScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        # Organize by division -> schools
        self.divisions_data = {
            'DI': [],
            'DII': [],
            'DIII': [],
            'NAIA': [],
            'NJCAA': []
        }
        self.schools_processed = []
        self.schools_failed = []
        self.checkpoint = self.load_checkpoint()
        self.request_count = 0
        self.consecutive_403s = 0

    def load_checkpoint(self) -> Dict:
        """Load checkpoint to resume from last position"""
        if CHECKPOINT_FILE.exists():
            with open(CHECKPOINT_FILE, 'r') as f:
                return json.load(f)
        return {'last_school_id': 0, 'athletes_scraped': 0}

    def save_checkpoint(self, school_id: int, athletes_count: int):
        """Save progress checkpoint and incremental data"""
        checkpoint = {
            'last_school_id': school_id,
            'athletes_scraped': athletes_count,
            'timestamp': datetime.now().isoformat()
        }
        CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CHECKPOINT_FILE, 'w') as f:
            json.dump(checkpoint, f, indent=2)

        # Also save incremental data to avoid losing progress
        self.save_incremental_data()

    def save_school_file(self, division: str, school_data: Dict):
        """Save individual school roster to its own JSON file"""
        # Create division folder
        division_dir = OUTPUT_DIR / division
        division_dir.mkdir(parents=True, exist_ok=True)

        # Clean school name for filename
        school_name = school_data['school_name']
        filename = school_name.replace(' ', '_').replace('&', 'and').replace('.', '')
        filename = re.sub(r'[^a-zA-Z0-9_-]', '', filename) + '.json'

        school_file = division_dir / filename
        with open(school_file, 'w') as f:
            json.dump(school_data, f, indent=2)

    def save_incremental_data(self):
        """Save progress summary (schools already saved as individual files)"""
        # Calculate totals
        total_athletes = sum(
            sum(school.get('total_athletes', 0) for school in schools)
            for schools in self.divisions_data.values()
        )

        # Build division summaries (without full school data)
        divisions_summary = {}
        for div, schools in self.divisions_data.items():
            div_athletes = sum(school.get('total_athletes', 0) for school in schools)
            divisions_summary[div] = {
                'total_schools': len(schools),
                'total_athletes': div_athletes,
                'schools_scraped': [s['school_name'] for s in schools]
            }

        # Save summary file
        summary_file = OUTPUT_DIR / "PROGRESS_SUMMARY.json"
        with open(summary_file, 'w') as f:
            json.dump({
                'metadata': {
                    'season': SEASON,
                    'last_updated': datetime.now().isoformat(),
                    'total_athletes': total_athletes,
                    'total_schools_processed': len(self.schools_processed),
                    'schools_failed': len(self.schools_failed),
                    'status': 'IN_PROGRESS'
                },
                'divisions': divisions_summary,
                'failed_schools': self.schools_failed
            }, f, indent=2)

        logger.debug(f"Progress saved: {total_athletes} athletes across {len(self.schools_processed)} schools")

    def smart_delay(self):
        """Intelligent delay with randomization to avoid detection"""
        delay = BASE_DELAY + random.uniform(0, RANDOM_JITTER)
        time.sleep(delay)

    def rotate_user_agent(self):
        """Rotate user agent every N requests"""
        self.request_count += 1
        if self.request_count % 50 == 0:  # Rotate every 50 requests
            agent = random.choice(USER_AGENTS)
            self.session.headers.update({'User-Agent': agent})
            logger.debug(f"Rotated user agent after {self.request_count} requests")

    def get_schools_from_db(self) -> List[Dict]:
        """Get all schools from SQLite database"""
        logger.info(f"Loading schools from {SQLITE_DB_PATH}")
        conn = sqlite3.connect(SQLITE_DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Get all active schools with their division
        cursor.execute("""
            SELECT school_id, official_name, short_name, state, division
            FROM schools
            WHERE is_active = 1
            ORDER BY division, school_id
        """)

        schools = [dict(row) for row in cursor.fetchall()]
        conn.close()

        logger.info(f"Loaded {len(schools)} schools")
        return schools

    def build_tfrrs_url(self, school_name: str, state: str, gender: str, division: str) -> str:
        """
        Build TFRRS team URL for 2026 indoor season
        Pattern:
        - NCAA/NAIA: https://www.tfrrs.org/teams/tf/TX_college_m_School_Name.html
        - NJCAA: https://www.tfrrs.org/teams/tf/TX_jcollege_m_School_Name.html
        """
        # Clean school name for URL (replace spaces with underscores, handle special chars)
        clean_name = school_name.replace(' ', '_').replace('&', 'and')
        clean_name = re.sub(r'[^a-zA-Z0-9_-]', '', clean_name)

        # Gender prefix: m for men, w for women
        gender_prefix = 'm' if gender == 'M' else 'w'

        # Use 'jcollege' for NJCAA, 'college' for all others
        college_type = 'jcollege' if division == 'NJCAA' else 'college'

        # Build URL
        url = f"https://www.tfrrs.org/teams/tf/{state}_{college_type}_{gender_prefix}_{clean_name}.html"
        return url

    def extract_athletes_from_html(self, html: str, school_id: int, gender: str) -> List[Dict]:
        """Extract athlete data from TFRRS team page HTML"""
        soup = BeautifulSoup(html, 'html.parser')
        athletes = []

        # Find all athlete links from BOTH roster tables AND performance tables
        # Pattern: /athletes/{id}/{School}/{Name}.html or /athletes/{id}/{School}/{Name}
        athlete_links = soup.find_all('a', href=re.compile(r'/athletes/\d+/'))

        seen_ids = set()  # Avoid duplicates

        for link in athlete_links:
            href = link.get('href', '')

            # Extract athlete ID from URL
            match = re.search(r'/athletes/(\d+)/([^/]+)/(.+?)(?:\.html)?$', href)
            if not match:
                continue

            athlete_id = match.group(1)
            school_name_url = match.group(2)
            athlete_name_url = match.group(3).replace('.html', '')

            # Skip if already seen
            if athlete_id in seen_ids:
                continue
            seen_ids.add(athlete_id)

            # Get full name from link text or URL
            full_name = link.get_text(strip=True) or athlete_name_url.replace('_', ' ')

            # Try to find class year from nearby table cells
            class_year = None
            parent_row = link.find_parent('tr')
            if parent_row:
                cells = parent_row.find_all('td')
                for cell in cells:
                    text = cell.get_text(strip=True)
                    # Match patterns like FR-1, SO-2, JR-3, SR-4
                    if re.match(r'(FR|SO|JR|SR)-\d', text):
                        class_year = text.split('-')[0]  # Just FR, SO, JR, SR
                        break

            # Build full profile URL
            profile_url = f"https://www.tfrrs.org{href}"

            athlete_data = {
                'tfrrs_athlete_id': athlete_id,
                'full_name': full_name,
                'school_id': school_id,
                'class_year': class_year,
                'gender': gender,
                'tfrrs_profile_url': profile_url,
                'scraped_at': datetime.now().isoformat(),
                'season': SEASON
            }

            athletes.append(athlete_data)

        return athletes

    def scrape_school_roster(self, school: Dict, gender: str) -> List[Dict]:
        """Scrape roster for a single school/gender combination"""
        school_name = school['official_name']
        state = school['state'] or 'TX'  # Default to TX if no state
        school_id = school['school_id']
        division = school['division']

        url = self.build_tfrrs_url(school_name, state, gender, division)
        gender_label = "Men's" if gender == 'M' else "Women's"

        logger.info(f"Scraping {gender_label} roster for {school_name} ({division})")
        logger.debug(f"URL: {url}")

        # Rotate user agent periodically
        self.rotate_user_agent()

        # First, try fast requests-based approach
        athletes = []
        for attempt in range(MAX_RETRIES):
            try:
                response = self.session.get(url, timeout=15)

                if response.status_code == 404:
                    logger.warning(f"No {gender_label} team found for {school_name} (404)")
                    self.consecutive_403s = 0  # Reset on success
                    return []

                if response.status_code == 403:
                    self.consecutive_403s += 1
                    logger.warning(f"403 Forbidden for {school_name} (consecutive: {self.consecutive_403s})")

                    # Exponential backoff for 403s
                    backoff_time = BACKOFF_403_DELAY * (2 ** min(self.consecutive_403s - 1, 3))
                    logger.info(f"  Backing off for {backoff_time}s due to rate limiting...")
                    time.sleep(backoff_time)

                    if attempt < MAX_RETRIES - 1:
                        continue
                    return []

                if response.status_code != 200:
                    logger.error(f"HTTP {response.status_code} for {school_name}")
                    if attempt < MAX_RETRIES - 1:
                        self.smart_delay()
                        continue
                    return []

                # Success - reset 403 counter
                self.consecutive_403s = 0

                # Extract athletes
                athletes = self.extract_athletes_from_html(
                    response.text,
                    school_id,
                    gender
                )

                logger.info(f"  Found {len(athletes)} {gender_label} athletes (fast)")
                break

            except requests.exceptions.RequestException as e:
                logger.error(f"Request error for {school_name}: {e}")
                if attempt < MAX_RETRIES - 1:
                    self.smart_delay()
                    continue
                return []

        # If fast approach got 0 athletes, try browser automation (may need dropdown selection)
        if len(athletes) == 0:
            logger.info(f"  Retrying with browser automation (dropdown selection)...")
            try:
                athletes = asyncio.run(self.scrape_with_browser(school_name, state, gender, school_id, division))
                logger.info(f"  Found {len(athletes)} {gender_label} athletes (browser)")
            except Exception as e:
                logger.error(f"  Browser scraping failed: {e}")
                return []

        return athletes

    async def scrape_with_browser(self, school_name: str, state: str, gender: str, school_id: int, division: str) -> List[Dict]:
        """Scrape using browser automation for JavaScript-heavy pages"""
        clean_name = school_name.replace(' ', '_').replace('&', 'and')
        clean_name = re.sub(r'[^a-zA-Z0-9_-]', '', clean_name)
        gender_prefix = 'm' if gender == 'M' else 'w'

        # Use 'jcollege' for NJCAA, 'college' for all others
        college_type = 'jcollege' if division == 'NJCAA' else 'college'
        url = f"https://www.tfrrs.org/teams/tf/{state}_{college_type}_{gender_prefix}_{clean_name}.html"

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.set_extra_http_headers({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            })

            try:
                await page.goto(url, wait_until='networkidle', timeout=30000)

                # Select "2026 Indoor" from dropdown if it exists
                try:
                    await page.wait_for_selector('select[name="config_hnd"]', timeout=5000)
                    dropdown = page.locator('select[name="config_hnd"]')
                    options = await dropdown.locator('option').all_text_contents()
                    option_elements = await dropdown.locator('option').all()

                    # Find 2026 Indoor option
                    for i, option_text in enumerate(options):
                        if '2026' in option_text and 'Indoor' in option_text:
                            option_elem = option_elements[i]
                            indoor_value = await option_elem.get_attribute('value')
                            await dropdown.select_option(value=indoor_value)
                            await page.wait_for_timeout(3000)
                            break
                except:
                    pass  # No dropdown, that's okay

                # Wait for athlete links to load
                try:
                    await page.wait_for_selector('a[href*="/athletes/"]', timeout=10000)
                except:
                    await browser.close()
                    return []

                # Get rendered HTML
                html_content = await page.content()
                await browser.close()

                # Parse athletes from HTML
                soup = BeautifulSoup(html_content, 'html.parser')
                athletes = []
                athlete_links = soup.find_all('a', href=re.compile(r'/athletes/\d+/'))
                seen_ids = set()

                for link in athlete_links:
                    href = link.get('href', '')
                    match = re.search(r'/athletes/(\d+)/([^/]+)/(.+?)(?:\.html)?$', href)
                    if not match:
                        continue

                    athlete_id = match.group(1)
                    if athlete_id in seen_ids:
                        continue
                    seen_ids.add(athlete_id)

                    full_name = link.get_text(strip=True)
                    class_year = None
                    parent_row = link.find_parent('tr')
                    if parent_row:
                        cells = parent_row.find_all('td')
                        for cell in cells:
                            text = cell.get_text(strip=True)
                            if re.match(r'(FR|SO|JR|SR)-?\d?', text):
                                class_year = re.match(r'(FR|SO|JR|SR)', text).group(1)
                                break

                    athletes.append({
                        'tfrrs_athlete_id': athlete_id,
                        'full_name': full_name,
                        'school_id': school_id,
                        'class_year': class_year,
                        'gender': gender,
                        'tfrrs_profile_url': f"https://www.tfrrs.org{href}",
                        'scraped_at': datetime.now().isoformat(),
                        'season': SEASON
                    })

                return athletes

            except Exception as e:
                await browser.close()
                raise e

    def scrape_all_schools(self):
        """Main scraping loop"""
        schools = self.get_schools_from_db()

        # Resume from checkpoint if exists
        start_index = 0
        if self.checkpoint['last_school_id'] > 0:
            logger.info(f"Resuming from school_id {self.checkpoint['last_school_id']}")
            start_index = next(
                (i for i, s in enumerate(schools) if s['school_id'] > self.checkpoint['last_school_id']),
                0
            )

        total_schools = len(schools[start_index:])
        logger.info(f"Starting scrape of {total_schools} schools...")

        for idx, school in enumerate(schools[start_index:], 1):
            school_id = school['school_id']
            school_name = school['official_name']

            logger.info(f"\n[{idx}/{total_schools}] Processing: {school_name} ({school['division']})")

            try:
                # Scrape men's roster
                men_athletes = self.scrape_school_roster(school, 'M')
                self.smart_delay()

                # Scrape women's roster
                women_athletes = self.scrape_school_roster(school, 'F')
                self.smart_delay()

                # Store school data organized by division
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

                # Save individual school file immediately
                self.save_school_file(division, school_data)

                # Add to tracking (lightweight version without full rosters)
                self.divisions_data[division].append({
                    'school_id': school_id,
                    'school_name': school_name,
                    'total_athletes': len(men_athletes) + len(women_athletes)
                })
                self.schools_processed.append(school_id)

                # Save checkpoint every 10 schools
                if idx % 10 == 0:
                    total_athletes = sum(
                        sum(s.get('total_athletes', 0) for s in schools_list)
                        for schools_list in self.divisions_data.values()
                    )
                    self.save_checkpoint(school_id, total_athletes)
                    logger.info(f"Checkpoint saved: {total_athletes} athletes from {len(self.schools_processed)} schools")

            except Exception as e:
                logger.error(f"Failed to process {school_name}: {e}")
                self.schools_failed.append({'school_id': school_id, 'error': str(e)})
                continue

        # Calculate final totals
        total_athletes = sum(
            sum(s.get('total_athletes', 0) for s in schools_list)
            for schools_list in self.divisions_data.values()
        )

        logger.info(f"\n✅ Scraping complete!")
        logger.info(f"Total athletes scraped: {total_athletes}")
        logger.info(f"Schools processed: {len(self.schools_processed)}")
        logger.info(f"Schools failed: {len(self.schools_failed)}")

    def save_to_json(self):
        """Save final summary (individual school files already saved)"""
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y-%m-%d_%H%M%S')

        # Calculate totals
        total_athletes = sum(
            sum(s.get('total_athletes', 0) for s in schools_list)
            for schools_list in self.divisions_data.values()
        )

        # Build division summaries
        divisions_summary = {}
        for div, schools in self.divisions_data.items():
            div_athletes = sum(s.get('total_athletes', 0) for s in schools)
            divisions_summary[div] = {
                'total_schools': len(schools),
                'total_athletes': div_athletes,
                'schools_scraped': [s['school_name'] for s in schools]
            }

        # Save final summary
        summary_file = OUTPUT_DIR / f"FINAL_SUMMARY_{timestamp}.json"
        with open(summary_file, 'w') as f:
            json.dump({
                'metadata': {
                    'season': SEASON,
                    'completed_at': datetime.now().isoformat(),
                    'total_athletes': total_athletes,
                    'total_schools': len(self.schools_processed),
                    'schools_failed': len(self.schools_failed),
                    'status': 'COMPLETE'
                },
                'divisions': divisions_summary,
                'failed_schools': self.schools_failed,
                'note': 'Individual school rosters saved in division folders: DI/, DII/, DIII/, NAIA/, NJCAA/'
            }, f, indent=2)

        logger.info(f"✅ Saved final summary to: {summary_file}")
        logger.info(f"✅ Individual school files in: {OUTPUT_DIR}/[DI|DII|DIII|NAIA|NJCAA]/")
        return summary_file


def main():
    logger.info("=" * 60)
    logger.info("TFRRS Roster Scraper - 2026 Indoor Season")
    logger.info("=" * 60)

    scraper = TFRRSRosterScraper()

    try:
        scraper.scrape_all_schools()
        output_file = scraper.save_to_json()

        # Calculate final totals
        total_athletes = sum(
            sum(len(s.get('men_roster', [])) + len(s.get('women_roster', []))
                for s in schools_list)
            for schools_list in scraper.divisions_data.values()
        )

        logger.info("\n" + "=" * 60)
        logger.info("✅ SCRAPING COMPLETED SUCCESSFULLY!")
        logger.info(f"Output file: {output_file}")
        logger.info(f"Total athletes: {total_athletes}")
        logger.info(f"Total schools: {len(scraper.schools_processed)}")
        logger.info("=" * 60)

    except KeyboardInterrupt:
        logger.warning("\n⚠️  Scraping interrupted by user")
        logger.info("Saving progress...")
        scraper.save_to_json()
        logger.info("Progress saved. You can resume later.")

    except Exception as e:
        logger.error(f"❌ Fatal error: {e}", exc_info=True)
        logger.info("Attempting to save partial data...")
        scraper.save_to_json()


if __name__ == "__main__":
    main()
