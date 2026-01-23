#!/bin/bash
# SQLite to PostgreSQL Migration Script

echo "🚀 Starting SQLite to PostgreSQL migration..."

# Navigate to project root
cd "$(dirname "$0")/../.."

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and add your Supabase credentials"
    exit 1
fi

# Load environment variables
source .env

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: SUPABASE_SERVICE_ROLE_KEY not set in .env"
    exit 1
fi

if [ -z "$DB_PASSWORD" ]; then
    echo "❌ Error: DB_PASSWORD not set in .env"
    exit 1
fi

echo "✅ Environment loaded"
echo "📊 Starting data migration from SQLite to PostgreSQL..."

# Check if SQLite database exists
if [ ! -f "backend/server/track_hub.db" ]; then
    echo "❌ Error: SQLite database not found at backend/server/track_hub.db"
    exit 1
fi

# Install dependencies if needed
echo "📦 Installing dependencies..."
npm install sqlite3 pg

# Run the migration script
echo "🔄 Running data migration..."
node backend/scripts/migrate-data.js

echo "🎉 Migration complete!"
