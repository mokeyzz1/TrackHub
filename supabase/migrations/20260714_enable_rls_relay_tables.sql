-- Close security hole: relay_results / relay_athletes had RLS disabled (anon could write).
-- Match the results table: RLS on + public SELECT; service-role writes bypass RLS.
ALTER TABLE public.relay_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_athletes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access" ON public.relay_results;
DROP POLICY IF EXISTS "Public read access" ON public.relay_athletes;
CREATE POLICY "Public read access" ON public.relay_results  FOR SELECT TO public USING (true);
CREATE POLICY "Public read access" ON public.relay_athletes FOR SELECT TO public USING (true);
