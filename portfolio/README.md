# TrackHub Portfolio Materials

This folder contains case study materials for showcasing TrackHub in your portfolio.

## Files

| File | Purpose | Audience |
|------|---------|----------|
| **[HIGHLIGHTS.md](./HIGHLIGHTS.md)** | Quick overview, key stats | Recruiters, quick review |
| **[CASE_STUDY.md](./CASE_STUDY.md)** | Full project narrative | Portfolio visitors |
| **[TECHNICAL_DEEP_DIVE.md](./TECHNICAL_DEEP_DIVE.md)** | Code examples, architecture | Technical interviews |
| **[ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md)** | Visual system diagrams | Presentations |

## How to Use

### For Your Portfolio Website

1. Use **CASE_STUDY.md** as the main content
2. Pull key stats from **HIGHLIGHTS.md** for hero section
3. Add screenshots from the app (see below)

### For Technical Interviews

1. Review **TECHNICAL_DEEP_DIVE.md** for code explanations
2. Practice explaining the WA scoring implementation
3. Be ready to discuss the caching strategy
4. Know the trade-offs in the architecture

### For Presentations

1. Convert **ARCHITECTURE_DIAGRAM.md** to visual slides
2. Create Figma/Excalidraw versions for polish

## Recommended Screenshots

Add these to your portfolio:

1. **Home Screen** - Top performances leaderboard
2. **Meets Tab** - Live/upcoming/past meets
3. **Athlete Profile** - PRs and history
4. **Comparison View** - Head-to-head
5. **Design System** - Color palette showcase

## Talking Points

### "Tell me about a challenging technical problem you solved"

> "I needed to fairly compare athletes across different events - a sprinter vs a distance runner. I implemented the official World Athletics 2025 scoring system, which uses quadratic equations with event-specific coefficients. The key insight was detecting indoor meets by looking for 60m events, since indoor performances need different scoring. I also moved the entire scoring calculation into a PostgreSQL function, reducing 45+ client queries to a single database call."

### "How did you handle data from multiple sources?"

> "The data was fragmented across TFRRS, USTFCCCA, and Athletic.net. I built three specialized scrapers: one using Puppeteer with a stealth plugin to bypass Cloudflare protection on USTFCCCA, one using Cheerio for efficient HTML parsing of TFRRS results, and a rate-limited athlete backfill scraper. The hardest part was matching meets across platforms - I built a fuzzy matching algorithm with manual mappings for championships, improving match rate from 6% to 57%."

### "What would you do differently?"

> "I'd invest more in automated testing earlier. The event name normalization has 100+ variations that I discovered through manual testing. I'd also consider using a job queue for scraping instead of GitHub Actions cron schedules, which would give more flexibility and better error handling."

## Stats to Mention

- **2.8 million+** results imported
- **123,000+** athletes tracked
- **12,000+** meets in database
- **1,800+** schools covered
- **45 → 1** queries reduced with database functions
- **100+** events with WA scoring

---

*Good luck with your portfolio and interviews!*
