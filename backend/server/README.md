# Track Hub API Server

Express API server with TypeScript and SQLite for the Track Hub mobile app.

## Features

- **RESTful API** with TypeScript
- **SQLite Database** with 2.2M track & field results
- **CORS enabled** for React Native app
- **Pagination support** for large datasets
- **Search endpoints** for athletes and schools

## Getting Started

### Installation

```bash
cd server
npm install
```

### Development

Start the server in development mode with auto-reload:

```bash
npm run dev
```

Server runs on http://localhost:3000

### Production

Build and run:

```bash
npm run build
npm start
```

## API Endpoints

### Health Check
- `GET /api/health` - Check if API is running

### Performances
- `GET /api/performances` - Get performances with pagination
  - Query params: `limit`, `offset`, `event`, `gender`
- `GET /api/performances/ncaa` - Get NCAA Championship performances
  - Query params: `limit` (default: 10)

### Athletes
- `GET /api/athletes/search?q=<name>` - Search athletes by name
  - Query params: `q` (search term), `limit` (default: 20)
- `GET /api/athletes/:id` - Get athlete details
- `GET /api/athletes/:id/performances` - Get athlete's performances
  - Query params: `limit` (default: 20)

### Schools
- `GET /api/schools/search?q=<name>` - Search schools by name
  - Query params: `q` (search term), `limit` (default: 20)
- `GET /api/schools/:id` - Get school details

### Events
- `GET /api/events` - Get list of all events

## Example Requests

```bash
# Get health status
curl http://localhost:3000/api/health

# Get top 5 NCAA performances
curl "http://localhost:3000/api/performances/ncaa?limit=5"

# Search for athletes named "Kipchoge"
curl "http://localhost:3000/api/athletes/search?q=Kipchoge"

# Search for schools with "Washington" in name
curl "http://localhost:3000/api/schools/search?q=Washington"

# Get performances for 800m event
curl "http://localhost:3000/api/performances?event=800m&limit=20"
```

## Database

The API uses SQLite database (`track_hub.db`) containing:
- 2.2M track & field results
- 64,532 athletes
- Schools, conferences, teams, and more

Database schema includes:
- `athletes` - Athlete information
- `results` - Performance results
- `schools` - School information
- `teams` - Team rosters by gender
- `conferences` - Conference data
- And more...

## Tech Stack

- **Express.js** - Web framework
- **TypeScript** - Type safety
- **SQLite3** - Database
- **CORS** - Cross-origin support
- **Nodemon** - Auto-reload in dev

## Project Structure

```
server/
├── src/
│   ├── index.ts      # Main server file
│   ├── routes.ts     # API routes
│   └── database.ts   # Database connection
├── track_hub.db      # SQLite database
├── package.json
└── tsconfig.json
```
