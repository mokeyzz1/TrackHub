# Track Hub 🏃‍♂️

**A comprehensive track & field results platform for athletes, coaches, and fans**

Track Hub is a centralized platform that aggregates track & field data from multiple sources, providing athlete profiles, meet results, rankings, and leaderboards all in one place.

## 🎯 Features

### ✅ Completed Core Features

- **🏃‍♂️ Athlete Profiles**: Complete profiles with personal records, meet history, and performance stats
- **🏆 Leaderboards & Rankings**: Dynamic rankings by event, division, and scope (national, regional, conference)
- **📊 Smart Data Aggregation**: Multi-source scraping from USTFCCCA, TFRRS, and Athletic.net
- **🔍 Advanced Filtering**: Smart search and filter system for athletes and meets
- **📱 Mobile-First UI**: React Native components optimized for mobile and web
- **🗄️ Robust Database**: SQLite schema with proper indexing and relationships

### 🚀 Key Components Built

1. **Data Layer**
   - Complete athlete and meet data types (`types/athlete.ts`, `types/meet.ts`)
   - Event definitions with 30+ track & field events (`types/events.ts`)
   - SQLite database schema with proper relationships (`database/schema.sql`)
   - Database manager with full CRUD operations (`database/track_hub_db.py`)

2. **Data Collection**
   - Enhanced multi-source scraper (`scrape_track_hub.py`)
   - USTFCCCA meet listings and results
   - TFRRS detailed results parsing
   - Athletic.net athlete search integration

3. **Ranking System**
   - Automated ranking calculations (`ranking_system.py`)
   - National, regional, conference, and state scopes
   - Team rankings based on athlete performance
   - Weekly ranking updates and reports

4. **Mobile UI Components**
   - Athlete profile display (`components/AthleteProfile.tsx`)
   - Athlete search with filtering (`components/AthleteSearch.tsx`)
   - Interactive leaderboards (`components/Leaderboard.tsx`)
   - Smart filter system (`components/SmartFilter.tsx`)
   - Complete app navigation (`TrackHubApp.tsx`)

## 🏗️ Architecture

### Data Flow
```
Data Sources → Scrapers → Database → Rankings → Mobile App
    ↓            ↓          ↓          ↓         ↓
USTFCCCA    scrape_    SQLite     ranking_   React
TFRRS       track_     with       system.    Native
Athletic.   hub.py     indexes   py         Components
net
```

### Database Schema
- **Athletes**: Personal info, school affiliation, events
- **Schools**: Institution details, division, conference
- **Meets**: Event details, venue, status
- **Results**: Individual performances with context
- **Personal Records**: Best marks with verification
- **Rankings**: Calculated positions across scopes

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- Node.js 16+
- React Native development environment
- Chrome WebDriver for scraping

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo>
   cd track-meet-tracker
   ```

2. **Install Python dependencies**
   ```bash
   pip install selenium beautifulsoup4 sqlite3
   ```

3. **Install React Native dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

4. **Set up the database**
   ```bash
   python -c "from database.track_hub_db import TrackHubDatabase; TrackHubDatabase()"
   ```

### Usage

1. **Scrape initial data**
   ```bash
   python scrape_track_hub.py
   ```

2. **Update rankings**
   ```bash
   python ranking_system.py
   ```

3. **Run the mobile app**
   ```bash
   npx expo start
   ```

## 📊 Data Sources

### Primary Sources (Free & Public)
- **USTFCCCA**: College meet listings and basic results  
- **TFRRS**: Detailed college results and athlete profiles
- **Athletic.net**: High school and some college data
- **DirectAthletics**: Meet hosting and timing services

### Data Coverage
- **College**: NCAA D1, D2, D3, NAIA, NJCAA
- **High School**: State and national level competitions
- **Events**: All standard track & field events (30+ events)
- **Geographic**: National coverage with regional breakdowns

## 🔧 Technical Details

### Key Files Structure
```
track-meet-tracker/
├── types/                  # TypeScript type definitions
│   ├── athlete.ts         # Athlete and related types
│   ├── meet.ts           # Meet and competition types
│   └── events.ts         # Event definitions and utilities
├── database/              # Database layer
│   ├── schema.sql        # SQLite database schema
│   └── track_hub_db.py   # Database manager class
├── components/            # React Native UI components
│   ├── AthleteProfile.tsx
│   ├── AthleteSearch.tsx
│   ├── Leaderboard.tsx
│   └── SmartFilter.tsx
├── scrape_track_hub.py   # Enhanced data scraper
├── ranking_system.py     # Ranking calculation engine
└── TrackHubApp.tsx      # Main app navigation
```

### Performance Features
- **Database Indexing**: Optimized queries for fast searches
- **Smart Caching**: Efficient data storage and retrieval
- **Lazy Loading**: UI components load data as needed
- **Incremental Updates**: Only update changed rankings

## 🎯 Roadmap & Future Features

### Phase 1 (Current) ✅
- ✅ Core data structure and database
- ✅ Multi-source data scraping
- ✅ Basic UI components
- ✅ Ranking system

### Phase 2 (Next)
- [ ] Live results integration
- [ ] Push notifications for PR alerts
- [ ] Photo integration from meets
- [ ] Advanced analytics and trends
- [ ] Coach and team management tools

### Phase 3 (Future)
- [ ] Social features (following athletes)
- [ ] Predictive performance modeling
- [ ] Meet scheduling integration
- [ ] Video highlights integration
- [ ] API for third-party developers

## 🤝 Contributing

Track Hub is built to serve the track & field community. Contributions welcome!

### Areas for Contribution
- **Data Sources**: Add new scrapers for regional sites
- **UI/UX**: Improve mobile experience and accessibility  
- **Performance**: Optimize database queries and app speed
- **Features**: Add new analysis tools and visualizations

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📱 Screenshots & Demo

*[Add screenshots of key components once built]*

- Athlete profiles with PRs and rankings
- Searchable athlete database with smart filters
- Dynamic leaderboards by event and division
- Clean, mobile-first interface

## 🔒 Data & Privacy

- **Public Data Only**: All scraped data is from publicly available sources
- **Attribution**: Proper credit given to data sources
- **Rate Limiting**: Respectful scraping practices
- **No Personal Data**: Only competition results and public profiles

## 📞 Support & Community

- **Issues**: Use GitHub issues for bugs and feature requests
- **Discussions**: Join discussions for ideas and questions
- **Contact**: [Your contact information]

## 📄 License

[Choose appropriate license - MIT recommended for open source]

---

**Track Hub** - Making track & field data accessible to everyone in the community 🏃‍♂️🏃‍♀️

*Built with ❤️ for athletes, coaches, and fans*
