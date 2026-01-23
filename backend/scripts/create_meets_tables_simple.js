// Create meets and events tables using simple SQL commands
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('\n📋 Creating meets and events tables in Supabase...\n');
console.log('Please run the following SQL in your Supabase SQL Editor:\n');
console.log('👉 https://supabase.com/dashboard/project/hunbahsnaeeztmzqpnrl/sql/new\n');
console.log('='.repeat(80));
console.log(`
-- Create meets table
CREATE TABLE IF NOT EXISTS meets (
  meet_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  location TEXT,
  meet_url TEXT,
  status TEXT CHECK (status IN ('upcoming', 'live', 'completed')) DEFAULT 'upcoming',
  level TEXT,
  season TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  event_id SERIAL PRIMARY KEY,
  meet_id INTEGER NOT NULL REFERENCES meets(meet_id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_type TEXT,
  gender TEXT CHECK (gender IN ('M', 'F', 'Mixed')),
  status TEXT CHECK (status IN ('scheduled', 'in_progress', 'completed')) DEFAULT 'scheduled',
  scheduled_time TIMESTAMP WITH TIME ZONE,
  actual_start_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_meets_date ON meets(date);
CREATE INDEX IF NOT EXISTS idx_meets_status ON meets(status);
CREATE INDEX IF NOT EXISTS idx_events_meet_id ON events(meet_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

-- Enable Row Level Security
ALTER TABLE meets ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Create policies to allow public read access
CREATE POLICY IF NOT EXISTS "Allow public read access to meets"
  ON meets FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Allow public read access to events"
  ON events FOR SELECT
  USING (true);
`);
console.log('='.repeat(80));
console.log('\n✅ After running the SQL, press Enter to continue...');

// Wait for user confirmation
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('', async () => {
  readline.close();

  console.log('\n🔍 Verifying tables were created...\n');

  const { data, error } = await supabase
    .from('meets')
    .select('*')
    .limit(1);

  if (error && error.code === 'PGRST204') {
    console.log('✅ Tables exist but are empty (expected)\n');
  } else if (error) {
    console.error('❌ Error:', error);
    console.log('\n⚠️  Please make sure you ran the SQL in Supabase SQL Editor\n');
  } else {
    console.log('✅ Tables created successfully!\n');
  }

  console.log('🎉 Ready to create test meets!\n');
});
