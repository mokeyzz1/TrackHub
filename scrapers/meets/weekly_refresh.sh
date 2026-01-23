#!/bin/bash
#
# Weekly Meets Refresh Script
# Run via cron: 0 6 * * 1 /path/to/weekly_refresh.sh
# (Runs every Monday at 6 AM)
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/../logs"
DATE=$(date +%Y-%m-%d_%H%M%S)

echo "=== Weekly Meets Refresh ==="
echo "Started: $(date)"
echo ""

# Run the scraper
cd "$SCRIPT_DIR"
node scrape_meets.js all >> "$LOG_DIR/weekly_$DATE.log" 2>&1

# Check exit status
if [ $? -eq 0 ]; then
    echo "SUCCESS: Meets refresh completed"
else
    echo "ERROR: Meets refresh failed"
fi

echo ""
echo "Finished: $(date)"
