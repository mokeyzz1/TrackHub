-- Drop existing policy if any
DROP POLICY IF EXISTS "Allow public inserts" ON waitlist;

-- Create permissive insert policy for anon users
CREATE POLICY "Allow anon inserts" ON waitlist
  FOR INSERT 
  TO anon
  WITH CHECK (true);
