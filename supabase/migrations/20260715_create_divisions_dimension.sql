-- Divisions as a first-class dimension (additive — no existing column touched).
-- APPLIED to prod 2026-07-15. Backfill: schools 1699/1832, conferences 1055/1114,
-- regions 26/27 (unlinked = 'Other' schools, null-division conferences, 'Independent' region).
--
-- Research-validated (2026-07-15): NCAA DI/DII/DIII, NAIA, NJCAA are separate governing
-- worlds; each conference and each region belongs to exactly one division; NAIA has no
-- regions (national qualifying standards); NJCAA has 24 numbered geographic regions (not
-- yet loaded). DI championship regions are SPORT-SPECIFIC: XC uses the 9 geographic regions,
-- outdoor track qualifies via East/West preliminary rounds — so regions here = geographic/XC
-- regions, and East/West is derived, never stored.
--
-- Old text columns (schools.division, conferences.division, region_name's 'DI ' prefix)
-- stay untouched until the frontend migration retires them. Known follow-ups:
--   * split the catch-all 'Independent(s)' conference into per-division rows (TFRRS-style),
--     then enforce school.division == conference.division (composite FK or trigger)
--   * classify the 133 'Other' schools; the ~59 no-division conferences
--   * DIII shows 9 regions, NCAA has 10 — one region missing (likely New England/Niagara)

CREATE TABLE IF NOT EXISTS public.divisions (
  division_id    serial PRIMARY KEY,
  code           text UNIQUE NOT NULL,       -- 'DI','DII','DIII','NAIA','NJCAA'
  display_name   text NOT NULL,
  governing_body text NOT NULL,              -- 'NCAA','NAIA','NJCAA'
  sort_order     integer NOT NULL
);

INSERT INTO public.divisions (code, display_name, governing_body, sort_order) VALUES
  ('DI',    'NCAA Division I',        'NCAA',  1),
  ('DII',   'NCAA Division II',       'NCAA',  2),
  ('DIII',  'NCAA Division III',      'NCAA',  3),
  ('NAIA',  'NAIA',                   'NAIA',  4),
  ('NJCAA', 'NJCAA (Junior College)', 'NJCAA', 5)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.schools     ADD COLUMN IF NOT EXISTS division_id integer REFERENCES public.divisions(division_id);
ALTER TABLE public.conferences ADD COLUMN IF NOT EXISTS division_id integer REFERENCES public.divisions(division_id);
ALTER TABLE public.regions     ADD COLUMN IF NOT EXISTS division_id integer REFERENCES public.divisions(division_id);

UPDATE public.schools s     SET division_id = d.division_id FROM public.divisions d
  WHERE s.division_id IS NULL AND upper(s.division) = d.code;
UPDATE public.conferences c SET division_id = d.division_id FROM public.divisions d
  WHERE c.division_id IS NULL AND upper(c.division) = d.code;
UPDATE public.regions r     SET division_id = d.division_id FROM public.divisions d
  WHERE r.division_id IS NULL AND split_part(r.region_name, ' ', 1) = d.code;

CREATE INDEX IF NOT EXISTS idx_schools_division_id     ON public.schools(division_id);
CREATE INDEX IF NOT EXISTS idx_conferences_division_id ON public.conferences(division_id);
