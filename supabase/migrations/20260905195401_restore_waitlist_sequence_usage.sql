-- The existing insert-only waitlist API needs nextval for its serial primary key.
-- USAGE permits ID generation, not setval or access to waitlist contents.
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF pg_get_serial_sequence('public.waitlist', 'id') IS DISTINCT FROM 'public.waitlist_id_seq' THEN
    RAISE EXCEPTION 'Unexpected waitlist ID sequence; refusing privilege change';
  END IF;
END
$$;
GRANT USAGE ON SEQUENCE public.waitlist_id_seq TO anon, authenticated;
