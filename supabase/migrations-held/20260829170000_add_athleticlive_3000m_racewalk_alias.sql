-- AthleticLIVE uses the unqualified label for the existing 3000m race-walk event.
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT '3000m Race Walk', event_type_id
FROM public.event_types
WHERE code = '3000m RW'
ON CONFLICT (raw_name) DO UPDATE
SET event_type_id = EXCLUDED.event_type_id;
