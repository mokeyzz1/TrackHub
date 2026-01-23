#!/bin/bash
# Full Roster Update Workflow for 2026 Indoor Season

set -e  # Exit on error

echo "=========================================="
echo "TFRRS Roster Update - 2026 Indoor Season"
echo "=========================================="
echo ""

# Step 1: Export baseline
echo "Step 1/3: Exporting baseline data from SQLite..."
python3 export_baseline.py
echo "✅ Baseline exported"
echo ""

# Step 2: Scrape new rosters
echo "Step 2/3: Scraping 2026 indoor rosters from TFRRS..."
echo "⚠️  This may take 1-2 hours for all schools"
echo "   Press Ctrl+C to stop (progress is saved)"
echo ""
read -p "Continue with scraping? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Scraping skipped. Run manually: python3 scrape_rosters.py"
    exit 0
fi

python3 scrape_rosters.py
echo "✅ Scraping complete"
echo ""

# Step 3: Generate diff
echo "Step 3/3: Generating diff (new/transfers/updated/removed)..."
python3 generate_diff.py
echo "✅ Diff generated"
echo ""

echo "=========================================="
echo "✅ WORKFLOW COMPLETE!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Review the diff file in ../output/"
echo "2. Verify transfers and new athletes look correct"
echo "3. Run upload script when ready (to be created)"
echo ""
