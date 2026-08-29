-- AthleticLIVE appends "- Semis" to the display label for semifinal rounds. The round parser
-- preserves that subdivision as Semifinals; these aliases provide only the canonical event.
WITH aliases(raw_name, canonical_code) AS (
  VALUES
    ('60m - Semis', '60m'),
    ('60m Hurdles - Semis', '60m H')
)
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT a.raw_name, e.event_type_id
FROM aliases a
JOIN public.event_types e ON e.code = a.canonical_code
ON CONFLICT (raw_name) DO UPDATE
SET event_type_id = EXCLUDED.event_type_id;
