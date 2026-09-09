-- Add end_date column to meets table for multi-day meets
-- Run this in Supabase SQL Editor

-- Add the column
ALTER TABLE meets ADD COLUMN IF NOT EXISTS end_date DATE;

-- Set end_date = date for existing single-day meets
UPDATE meets SET end_date = date WHERE end_date IS NULL;

-- Make end_date NOT NULL going forward (optional, but good practice)
-- ALTER TABLE meets ALTER COLUMN end_date SET NOT NULL;
