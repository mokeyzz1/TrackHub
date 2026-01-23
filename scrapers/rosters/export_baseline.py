#!/usr/bin/env python3
"""
Export Baseline Roster Data
Exports current athlete roster data from SQLite to JSON for comparison
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Get absolute paths relative to this script's location
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent  # Go up to track-meet-tracker/
SQLITE_DB_PATH = PROJECT_ROOT / "backend" / "server" / "track_hub.db"
OUTPUT_DIR = SCRIPT_DIR.parent / "data"


def export_baseline():
    """Export current athlete data as baseline for diff comparison"""
    logger.info(f"Connecting to {SQLITE_DB_PATH}")

    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Get all current athletes with their key info
    cursor.execute("""
        SELECT
            athlete_id,
            school_id,
            full_name,
            first_name,
            last_name,
            class_year,
            gender,
            tfrrs_athlete_id,
            tfrrs_profile_url,
            primary_events,
            hometown,
            high_school,
            is_active,
            created_at,
            updated_at
        FROM athletes
        WHERE is_active = 1
        ORDER BY school_id, athlete_id
    """)

    athletes = [dict(row) for row in cursor.fetchall()]
    conn.close()

    logger.info(f"Exported {len(athletes)} athletes from database")

    # Save to JSON
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime('%Y-%m-%d_%H%M%S')
    baseline_file = OUTPUT_DIR / f"baseline_rosters_{timestamp}.json"

    with open(baseline_file, 'w') as f:
        json.dump({
            'metadata': {
                'exported_at': datetime.now().isoformat(),
                'total_athletes': len(athletes),
                'source': str(SQLITE_DB_PATH)
            },
            'athletes': athletes
        }, f, indent=2)

    logger.info(f"✅ Baseline saved to: {baseline_file}")
    logger.info(f"Total athletes: {len(athletes)}")

    # Also save a copy as 'latest' for easy reference
    latest_file = OUTPUT_DIR / "baseline_rosters_latest.json"
    with open(latest_file, 'w') as f:
        json.dump({
            'metadata': {
                'exported_at': datetime.now().isoformat(),
                'total_athletes': len(athletes),
                'source': str(SQLITE_DB_PATH)
            },
            'athletes': athletes
        }, f, indent=2)

    logger.info(f"✅ Also saved as: {latest_file}")

    return baseline_file


if __name__ == "__main__":
    export_baseline()
