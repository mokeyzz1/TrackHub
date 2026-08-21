-- AthleticLIVE can qualify a relay with the meeting type instead of the
-- division. Keep the qualifier in the alias table and use the canonical
-- 4x400m relay event type.
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT '4x400m Relay Invitational', event_type_id
  FROM public.event_types
 WHERE code = '4x400m'
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;
