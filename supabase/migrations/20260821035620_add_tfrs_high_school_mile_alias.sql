-- TFRRS division qualifier for the canonical mile event.
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT '1 Mile Run High School', event_type_id
  FROM public.event_types
 WHERE code = 'Mile'
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;
