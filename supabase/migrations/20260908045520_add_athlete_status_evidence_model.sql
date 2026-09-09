-- Separate dated athlete-status evidence from per-performance representation.
-- This migration is additive and intentionally performs no athlete classification backfill.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE public.athlete_status_evidence (
  athlete_status_evidence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id bigint NOT NULL REFERENCES public.athletes(athlete_id) ON DELETE RESTRICT,
  status_axis text NOT NULL,
  status_value text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  evidence_type text NOT NULL,
  source text NOT NULL,
  source_record_key text NOT NULL,
  source_url text,
  source_snapshot_hash text,
  verification_status text NOT NULL DEFAULT 'source_observed',
  confidence numeric(4,3),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT athlete_status_evidence_axis_value_ck CHECK (
    (status_axis = 'career_stage' AND status_value IN ('scholastic','collegiate','post_collegiate'))
    OR
    (status_axis = 'professional_status' AND status_value IN ('professional','nonprofessional'))
  ),
  CONSTRAINT athlete_status_evidence_dates_ck
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT athlete_status_evidence_type_ck CHECK (
    evidence_type IN ('roster','individual_result','relay_result','source_profile',
                      'governing_body','owner_review')
  ),
  CONSTRAINT athlete_status_evidence_verification_ck CHECK (
    verification_status IN ('source_observed','source_verified','owner_verified','unresolved','rejected')
  ),
  CONSTRAINT athlete_status_evidence_confidence_ck
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT athlete_status_evidence_source_ck CHECK (btrim(source) <> ''),
  CONSTRAINT athlete_status_evidence_source_record_ck CHECK (btrim(source_record_key) <> ''),
  CONSTRAINT athlete_status_evidence_source_identity_uq
    UNIQUE NULLS NOT DISTINCT
      (source, source_record_key, status_axis, status_value, effective_from, effective_to)
);

CREATE TABLE public.athlete_status_periods (
  athlete_status_period_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id bigint NOT NULL REFERENCES public.athletes(athlete_id) ON DELETE RESTRICT,
  status_axis text NOT NULL,
  status_value text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  resolution_status text NOT NULL DEFAULT 'provisional',
  resolution_method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT athlete_status_periods_axis_value_ck CHECK (
    (status_axis = 'career_stage' AND status_value IN ('scholastic','collegiate','post_collegiate'))
    OR
    (status_axis = 'professional_status' AND status_value IN ('professional','nonprofessional'))
  ),
  CONSTRAINT athlete_status_periods_dates_ck
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT athlete_status_periods_resolution_ck
    CHECK (resolution_status IN ('provisional','confirmed','disputed')),
  CONSTRAINT athlete_status_periods_method_ck CHECK (btrim(resolution_method) <> ''),
  CONSTRAINT athlete_status_periods_confirmed_no_overlap
    EXCLUDE USING gist (
      athlete_id WITH =,
      status_axis WITH =,
      daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[)') WITH &&
    ) WHERE (resolution_status = 'confirmed')
);

CREATE TABLE public.athlete_status_period_evidence (
  athlete_status_period_id bigint NOT NULL
    REFERENCES public.athlete_status_periods(athlete_status_period_id) ON DELETE CASCADE,
  athlete_status_evidence_id bigint NOT NULL
    REFERENCES public.athlete_status_evidence(athlete_status_evidence_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_status_period_id, athlete_status_evidence_id)
);

CREATE INDEX athlete_status_evidence_athlete_axis_idx
  ON public.athlete_status_evidence(athlete_id, status_axis, effective_from DESC);
CREATE INDEX athlete_status_evidence_review_idx
  ON public.athlete_status_evidence(verification_status, status_axis)
  WHERE verification_status IN ('unresolved','source_observed');
CREATE INDEX athlete_status_periods_athlete_axis_idx
  ON public.athlete_status_periods(athlete_id, status_axis, effective_from DESC);
CREATE INDEX athlete_status_period_evidence_evidence_idx
  ON public.athlete_status_period_evidence(athlete_status_evidence_id);

CREATE VIEW public.v_athlete_current_status
WITH (security_invoker = true)
AS
SELECT
  athlete.athlete_id,
  career.status_value AS career_stage,
  career.effective_from AS career_stage_from,
  career.effective_to AS career_stage_to,
  career.resolution_status AS career_stage_resolution,
  professional.status_value AS professional_status,
  professional.effective_from AS professional_status_from,
  professional.effective_to AS professional_status_to,
  professional.resolution_status AS professional_status_resolution
FROM public.athletes athlete
LEFT JOIN public.athlete_status_periods career
  ON career.athlete_id = athlete.athlete_id
 AND career.status_axis = 'career_stage'
 AND career.resolution_status = 'confirmed'
 AND daterange(career.effective_from, coalesce(career.effective_to, 'infinity'::date), '[)')
     @> current_date
LEFT JOIN public.athlete_status_periods professional
  ON professional.athlete_id = athlete.athlete_id
 AND professional.status_axis = 'professional_status'
 AND professional.resolution_status = 'confirmed'
 AND daterange(professional.effective_from, coalesce(professional.effective_to, 'infinity'::date), '[)')
     @> current_date;

ALTER TABLE public.athlete_status_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_status_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_status_period_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY athlete_status_periods_public_read
  ON public.athlete_status_periods FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON public.athlete_status_evidence FROM PUBLIC;
REVOKE ALL ON public.athlete_status_periods FROM PUBLIC;
REVOKE ALL ON public.athlete_status_period_evidence FROM PUBLIC;
REVOKE ALL ON public.v_athlete_current_status FROM PUBLIC;

GRANT SELECT ON public.athlete_status_periods TO anon, authenticated;
GRANT SELECT ON public.v_athlete_current_status TO anon, authenticated;
GRANT ALL ON public.athlete_status_evidence TO service_role;
GRANT ALL ON public.athlete_status_periods TO service_role;
GRANT ALL ON public.athlete_status_period_evidence TO service_role;
GRANT SELECT ON public.v_athlete_current_status TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.athlete_status_evidence_athlete_status_evidence_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.athlete_status_periods_athlete_status_period_id_seq TO service_role;

COMMENT ON TABLE public.athlete_status_evidence IS
  'Private dated source assertions about athlete career stage or professional status; conflicts are preserved for review.';
COMMENT ON TABLE public.athlete_status_periods IS
  'Resolved dated athlete status intervals. effective_to is exclusive; confirmed intervals cannot overlap within an axis.';
COMMENT ON TABLE public.athlete_status_period_evidence IS
  'Many-to-many provenance linking resolved status periods to the private evidence that supports them.';
COMMENT ON VIEW public.v_athlete_current_status IS
  'Current confirmed career and professional status only; performance representation remains on result and relay affiliations.';

COMMIT;
