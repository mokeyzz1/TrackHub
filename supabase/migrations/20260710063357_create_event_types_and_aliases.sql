-- Canonical event catalog + alias map (applied 2026-07-14)
-- Additive: nothing read these at creation time.
CREATE TABLE IF NOT EXISTS public.event_types (
  event_type_id      serial PRIMARY KEY,
  code               text UNIQUE NOT NULL,
  category           text,
  measure            text,
  environment_scope  text CHECK (environment_scope IN ('indoor_only','outdoor_only','xc','both'))
);

CREATE TABLE IF NOT EXISTS public.event_aliases (
  raw_name       text PRIMARY KEY,
  event_type_id  integer NOT NULL REFERENCES public.event_types(event_type_id)
);

-- log for any event name a scraper sees that isn't in the alias map
CREATE TABLE IF NOT EXISTS public.unmapped_events (
  raw_name    text PRIMARY KEY,
  first_seen  timestamptz DEFAULT now(),
  seen_count  integer DEFAULT 1
);

-- additive columns on results (nullable; backfilled separately)
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS event_type_id integer REFERENCES public.event_types(event_type_id);
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS environment text CHECK (environment IN ('indoor','outdoor','xc'));
