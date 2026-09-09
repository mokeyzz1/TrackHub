-- Retire the unused per-meet scheduling table after its only frontend reader was removed.
-- The table is an empty legacy model; canonical event identity lives in event_types and facts
-- reference event_type_id directly. Do not use CASCADE: an unexpected dependent must stop this
-- migration instead of being removed implicitly.

DO $$
DECLARE
  row_count bigint;
BEGIN
  SELECT count(*) INTO row_count FROM public.events;
  IF row_count <> 0 THEN
    RAISE EXCEPTION 'public.events is not empty (% rows); retirement is blocked', row_count;
  END IF;
END
$$;

DROP TABLE public.events;
