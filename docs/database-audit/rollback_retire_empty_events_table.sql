-- Emergency rollback for 20260904141650_retire_empty_events_table.sql.
-- Recreates the exact empty public.events structure captured before retirement.

CREATE SEQUENCE public.events_event_id_seq
  AS integer
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  MAXVALUE 2147483647
  NO CYCLE;

CREATE TABLE public.events (
  event_id integer NOT NULL DEFAULT nextval('public.events_event_id_seq'::regclass),
  meet_id integer NOT NULL,
  event_name text NOT NULL,
  event_type text,
  gender text,
  status text DEFAULT 'scheduled'::text,
  scheduled_time timestamp with time zone,
  actual_start_time timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT events_pkey PRIMARY KEY (event_id),
  CONSTRAINT events_meet_id_fkey FOREIGN KEY (meet_id)
    REFERENCES public.meets(meet_id) ON DELETE CASCADE,
  CONSTRAINT events_gender_check CHECK (gender = ANY (ARRAY['M'::text, 'F'::text, 'Mixed'::text])),
  CONSTRAINT events_status_check CHECK (status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text]))
);

ALTER SEQUENCE public.events_event_id_seq OWNED BY public.events.event_id;

CREATE INDEX idx_events_meet_id ON public.events USING btree (meet_id);
CREATE INDEX idx_events_status ON public.events USING btree (status);

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_public_read ON public.events
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON TABLE public.events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.events TO anon, authenticated;
GRANT ALL ON TABLE public.events TO service_role;
REVOKE ALL ON SEQUENCE public.events_event_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE public.events_event_id_seq TO service_role;
