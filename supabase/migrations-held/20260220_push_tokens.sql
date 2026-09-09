-- Push tokens table for storing Expo push notification tokens
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_push_token TEXT NOT NULL UNIQUE,
  platform TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Index for querying active tokens
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (app registers tokens)
CREATE POLICY "Anyone can insert push tokens" ON push_tokens
  FOR INSERT WITH CHECK (true);

-- Allow updates (for marking tokens inactive)
CREATE POLICY "Anyone can update push tokens" ON push_tokens
  FOR UPDATE USING (true);

-- Allow service role to read all tokens (for sending notifications)
CREATE POLICY "Service role can read all" ON push_tokens
  FOR SELECT USING (true);
