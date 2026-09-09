# College Track Data Collection Guide

## 🎯 Goal: Build comprehensive college track & field database

### Why Start with College Data?
- **Most reliable sources**: TFRRS is the official college results system
- **Standardized data**: Consistent formats across all NCAA divisions
- **Active community**: Current season data available
- **Comprehensive coverage**: All events, divisions, conferences

---

## 📋 Step-by-Step Implementation Plan

### **PHASE 1: Setup & Initial Testing** ⚡ (Do This First)

#### Step 1: Install Dependencies
```bash
pip install selenium beautifulsoup4 requests
```

#### Step 2: Test Basic Scraping
```bash
# Test the college data collector with small sample
python college_data_collector.py
```

This will:
- Collect 10 NCAA D1 schools
- Get 5 athletes per school  
- Extract basic athlete info and PRs
- Save to `college_data_[timestamp].json`

#### Step 3: Verify Data Quality
Check the generated JSON file to ensure:
- School names are correct
- Athlete names are properly extracted
- Personal records have valid marks
- Meet information is captured

---

### **PHASE 2: Database Integration** 🗄️

#### Step 1: Initialize Database
```bash
# Create the database with proper schema
python -c "from database.track_hub_db import TrackHubDatabase; TrackHubDatabase()"
```

#### Step 2: Load College Data
```bash
# Integrate collected data into database
python college_data_integrator.py
```

This will:
- Load JSON files from collection phase
- Insert schools and athletes into database
- Map event names to standard format
- Calculate comparable mark values

#### Step 3: Verify Database
```bash
# Check database contents
sqlite3 track_hub.db "SELECT COUNT(*) FROM schools;"
sqlite3 track_hub.db "SELECT COUNT(*) FROM athletes;"
sqlite3 track_hub.db "SELECT name, division FROM schools LIMIT 10;"
```

---

### **PHASE 3: Scale Up Collection** 📈

#### Expand to More Schools
```python
# Modify college_data_collector.py
data = collector.run_college_data_collection(
    divisions=["NCAA D1"], 
    max_schools=100  # Increase from 10
)
```

#### Add More Divisions
```python
data = collector.run_college_data_collection(
    divisions=["NCAA D1", "NCAA D2", "NCAA D3"], 
    max_schools=50  # Per division
)
```

#### Collect More Athletes Per School
```python
# In collect_school_athletes method
athletes = self.collect_school_athletes(school['tfrrs_url'], limit=50)  # Increase from 20
```

---

### **PHASE 4: Data Enrichment** ✨

#### Add Current Season Results
1. Scrape recent meet results from TFRRS
2. Link results to existing athletes
3. Update personal records automatically

#### Add Rankings
```bash
# Generate initial rankings
python ranking_system.py
```

#### Add School Details
- Conference affiliations
- Geographic regions
- School colors/logos

---

## 🎯 **Data Sources Strategy**

### Primary: TFRRS (Track & Field Results Reporting System)
- **URL**: https://www.tfrrs.org
- **Coverage**: All NCAA divisions, NAIA, NJCAA
- **Data**: Athletes, results, meets, rankings
- **Reliability**: Official system used by colleges

### Secondary: USTFCCCA 
- **URL**: https://www.ustfccca.org
- **Coverage**: College meets and rankings
- **Data**: Meet schedules, team rankings
- **Use**: Cross-reference and meet listings

### Tertiary: Athletic.net
- **Coverage**: Some college, mostly high school
- **Use**: Fill gaps and verification

---

## 📊 **Expected Data Volume**

### NCAA Division I
- **Schools**: ~350 schools
- **Athletes**: ~15,000 active athletes (est.)
- **Events per athlete**: 2-4 on average
- **Total records**: ~50,000+ personal records

### All College Divisions (D1, D2, D3, NAIA, NJCAA)
- **Schools**: ~2,000 schools
- **Athletes**: ~80,000+ active athletes
- **Total records**: ~250,000+ personal records

---

## ⚡ **Quick Start Commands**

```bash
# 1. Test collection (small sample)
python college_data_collector.py

# 2. Check what was collected
ls -la college_data_*.json
head -50 college_data_*.json

# 3. Create database
python -c "from database.track_hub_db import TrackHubDatabase; TrackHubDatabase()"

# 4. Integrate data
python college_data_integrator.py

# 5. Check database
sqlite3 track_hub.db "SELECT COUNT(*) FROM athletes;"

# 6. Generate rankings
python ranking_system.py

# 7. Start mobile app (after database is populated)
npx expo start
```

---

## 🔧 **Configuration Options**

### Adjust Collection Speed
```python
# In college_data_collector.py
time.sleep(2)  # Increase for slower, more respectful scraping
time.sleep(0.5)  # Decrease for faster collection (be careful!)
```

### Filter by Conference
```python
# Target specific conferences
target_conferences = ['SEC', 'Big Ten', 'Pac-12', 'ACC']
# Add filtering logic in collect_college_schools()
```

### Focus on Specific Events
```python
# In collect_athlete_details(), filter PRs
target_events = ['100m', '200m', '400m', '800m', '1500m']
# Only collect records for these events
```

---

## 🎯 **Success Metrics**

### Phase 1 Success
- [ ] 10+ schools successfully scraped
- [ ] 50+ athletes with basic info
- [ ] Valid JSON output generated
- [ ] No major scraping errors

### Phase 2 Success  
- [ ] Database created successfully
- [ ] All schools integrated
- [ ] All athletes integrated
- [ ] Event names properly mapped

### Phase 3 Success
- [ ] 100+ schools in database
- [ ] 1000+ athletes with PRs
- [ ] Multiple divisions covered
- [ ] Rankings successfully generated

---

## 🚨 **Common Issues & Solutions**

### Scraping Issues
- **Rate limiting**: Increase `time.sleep()` values
- **Changed HTML structure**: Update CSS selectors
- **Timeout errors**: Increase `time.sleep()` after page loads

### Data Issues
- **Event name mapping**: Add new mappings to `map_event_name()`
- **Mark parsing**: Improve `parse_mark_value()` for edge cases
- **Duplicate athletes**: Add deduplication logic

### Database Issues
- **Schema errors**: Check `database/schema.sql`
- **Foreign key violations**: Ensure schools exist before athletes
- **Performance**: Add indexes for commonly queried fields

---

## 🎉 **Next Steps After Success**

1. **Expand to High School Data** (Athletic.net focus)
2. **Add Live Results** (real-time meet updates)
3. **Build Mobile App Features** (notifications, social features)
4. **Add Analytics** (performance trends, predictions)
5. **Community Features** (athlete following, team pages)

---

**Ready to start? Run the first command and let's build your college track database!** 🏃‍♂️
