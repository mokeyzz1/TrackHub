-- Reviewed external athlete aliases. These are intentionally private and do not rewrite the
-- public athletes row; the controlled adapter can use an active exact alias for provenance-safe
-- recovery while the canonical athlete profile remains unchanged.

CREATE TABLE IF NOT EXISTS ingest.athlete_aliases (
  athlete_alias_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source                 text NOT NULL
                         CHECK (source IN ('tfrrs', 'athletic_net', 'ustfccca', 'manual')),
  source_athlete_key     text NOT NULL,
  source_athlete_name    text,
  source_gender          text NOT NULL
                         CHECK (source_gender IN ('M', 'F')),
  target_athlete_id      bigint NOT NULL REFERENCES public.athletes(athlete_id) ON DELETE RESTRICT,
  match_method           text NOT NULL DEFAULT 'verified_alias'
                         CHECK (match_method IN ('exact_external_id', 'verified_alias', 'manual')),
  status                 text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'revoked')),
  notes                  text,
  verified_at            timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_athlete_key)
);

COMMENT ON TABLE ingest.athlete_aliases IS
  'Reviewed external athlete identities used by controlled ingestion without mutating public athlete profiles.';

CREATE INDEX IF NOT EXISTS ingest_athlete_aliases_target_idx
  ON ingest.athlete_aliases (target_athlete_id)
  WHERE status = 'active';

ALTER TABLE ingest.athlete_aliases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE ingest.athlete_aliases FROM PUBLIC;
REVOKE ALL ON SEQUENCE ingest.athlete_aliases_athlete_alias_id_seq FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ingest.athlete_aliases TO service_role';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE ingest.athlete_aliases_athlete_alias_id_seq TO service_role';
  END IF;
END
$$;

-- Verified from TFRRS athlete 9020036 (Caleb Prim, Concordia (Tex.)) and the sole existing
-- same-name, same-gender internal athlete with an athletic.net identity. The public athlete row
-- remains Unattached until a separate affiliation decision is made.
INSERT INTO ingest.athlete_aliases (
  source,
  source_athlete_key,
  source_athlete_name,
  source_gender,
  target_athlete_id,
  match_method,
  notes
)
SELECT
  'tfrrs',
  '9020036',
  'Caleb Prim',
  'M',
  a.athlete_id,
  'verified_alias',
  'TFRRS profile name/team match plus unique existing same-name male athlete with an external athletic.net identity; no public athlete affiliation was changed.'
FROM public.athletes a
JOIN public.schools s ON s.school_id = a.school_id
WHERE lower(a.full_name) = lower('Caleb Prim')
  AND a.gender = 'M'
  AND s.official_name = 'Unattached'
  AND a.athletic_net_url = 'https://www.athletic.net/athlete/27678287/track-and-field'
  AND (
    SELECT count(*)
    FROM public.athletes candidate
    JOIN public.schools candidate_school ON candidate_school.school_id = candidate.school_id
    WHERE lower(candidate.full_name) = lower('Caleb Prim')
      AND candidate.gender = 'M'
      AND candidate_school.official_name = 'Unattached'
      AND candidate.athletic_net_url = 'https://www.athletic.net/athlete/27678287/track-and-field'
  ) = 1
ON CONFLICT (source, source_athlete_key) DO UPDATE
SET source_athlete_name = EXCLUDED.source_athlete_name,
    source_gender = EXCLUDED.source_gender,
    target_athlete_id = EXCLUDED.target_athlete_id,
    status = 'active',
    match_method = EXCLUDED.match_method,
    notes = EXCLUDED.notes,
    verified_at = now(),
    updated_at = now();
