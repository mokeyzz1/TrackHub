-- AthleticLIVE labels this relay as a distance value, while the canonical
-- catalog stores the same event as DMR. Keep the raw label for provenance and
-- resolve it to the existing relay/time event type.
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT '4000m Distance Medley', event_type_id
  FROM public.event_types
 WHERE code = 'DMR'
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;
