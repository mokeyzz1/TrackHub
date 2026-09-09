-- Give school rows a stable institution category and make the mixed legacy
-- `divisions` dimension explicit.  This is intentionally additive: it does
-- not reassign athletes, teams, results, relay results, or historical rows.
--
-- `v_athlete_collegiate_history` is an internal read model.  It establishes
-- collegiate history from reviewed school classifications and already-stored
-- team, individual-result, and relay-result affiliations.  A source-provider
-- athlete ID is deliberately not treated as affiliation evidence.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS institution_type text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.divisions
  ADD COLUMN IF NOT EXISTS classification_kind text NOT NULL DEFAULT 'unknown';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.schools'::regclass
      AND conname = 'schools_institution_type_check'
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_institution_type_check
      CHECK (institution_type IN
        ('collegiate', 'high_school', 'club', 'unattached', 'other', 'unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.divisions'::regclass
      AND conname = 'divisions_classification_kind_check'
  ) THEN
    ALTER TABLE public.divisions
      ADD CONSTRAINT divisions_classification_kind_check
      CHECK (classification_kind IN ('division', 'association', 'league', 'unknown'));
  END IF;
END
$$;

DO $$
DECLARE
  updated_collegiate_schools integer;
  updated_sentinels integer;
BEGIN
  -- These three records are intentionally named sentinels.  They are the
  -- reviewed exceptional school rows that lack a division classification.
  IF NOT EXISTS (
    SELECT 1 FROM public.schools
    WHERE school_id = 421 AND official_name = 'Cheyney'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.schools
    WHERE school_id = 1829 AND official_name = 'Dawgs Track Club'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.schools
    WHERE school_id = 1835 AND official_name = 'Unattached'
  ) THEN
    RAISE EXCEPTION 'reviewed school sentinels are missing or no longer match';
  END IF;

  -- A school with a reviewed governing classification is collegiate.  This
  -- does not imply every athlete presently pointing at that school is active.
  UPDATE public.schools
  SET institution_type = 'collegiate',
      updated_at = now()
  WHERE division_id IS NOT NULL
    AND institution_type IS DISTINCT FROM 'collegiate';
  GET DIAGNOSTICS updated_collegiate_schools = ROW_COUNT;

  UPDATE public.schools
  SET institution_type = CASE school_id
      WHEN 421 THEN 'collegiate'
      WHEN 1829 THEN 'club'
      WHEN 1835 THEN 'unattached'
    END,
    updated_at = now()
  WHERE (school_id = 421 AND official_name = 'Cheyney')
     OR (school_id = 1829 AND official_name = 'Dawgs Track Club')
     OR (school_id = 1835 AND official_name = 'Unattached');
  GET DIAGNOSTICS updated_sentinels = ROW_COUNT;

  IF updated_sentinels <> 3 THEN
    RAISE EXCEPTION 'expected to classify exactly three reviewed school sentinels, updated %', updated_sentinels;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.schools
    WHERE division_id IS NOT NULL
      AND institution_type <> 'collegiate'
  ) THEN
    RAISE EXCEPTION 'school institution-type postcondition failed';
  END IF;

  RAISE NOTICE 'classified % reviewed collegiate schools and % sentinel schools',
    updated_collegiate_schools, updated_sentinels;
END
$$;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.divisions
    WHERE code IN (
      'DI', 'DII', 'DIII', 'NAIA', 'NJCAA', 'CCCAA', 'USPORTS', 'USCAA',
      'NCCAA-I', 'NCCAA-II', 'LAI'
    )
  ) <> 11 THEN
    RAISE EXCEPTION 'expected the reviewed 11 governing classification rows';
  END IF;

  UPDATE public.divisions
  SET classification_kind = CASE code
    WHEN 'DI' THEN 'division'
    WHEN 'DII' THEN 'division'
    WHEN 'DIII' THEN 'division'
    WHEN 'NCCAA-I' THEN 'division'
    WHEN 'NCCAA-II' THEN 'division'
    WHEN 'LAI' THEN 'league'
    WHEN 'NAIA' THEN 'association'
    WHEN 'NJCAA' THEN 'association'
    WHEN 'CCCAA' THEN 'association'
    WHEN 'USPORTS' THEN 'association'
    WHEN 'USCAA' THEN 'association'
  END
  WHERE code IN (
    'DI', 'DII', 'DIII', 'NAIA', 'NJCAA', 'CCCAA', 'USPORTS', 'USCAA',
    'NCCAA-I', 'NCCAA-II', 'LAI'
  );

  IF EXISTS (
    SELECT 1
    FROM public.divisions
    WHERE (code IN ('DI', 'DII', 'DIII', 'NCCAA-I', 'NCCAA-II')
           AND classification_kind <> 'division')
       OR (code IN ('NAIA', 'NJCAA', 'CCCAA', 'USPORTS', 'USCAA')
           AND classification_kind <> 'association')
       OR (code = 'LAI' AND classification_kind <> 'league')
  ) THEN
    RAISE EXCEPTION 'governing classification-kind postcondition failed';
  END IF;
END
$$;

CREATE OR REPLACE VIEW public.v_athlete_collegiate_history
WITH (security_invoker = true)
AS
SELECT
  a.athlete_id,
  a.school_id AS current_school_id,
  current_school.institution_type AS current_school_institution_type,
  evidence.has_collegiate_school,
  evidence.has_collegiate_team_season,
  evidence.has_collegiate_individual_result,
  evidence.has_collegiate_relay_result,
  CASE
    WHEN evidence.has_collegiate_school
      OR evidence.has_collegiate_team_season
      OR evidence.has_collegiate_individual_result
      OR evidence.has_collegiate_relay_result
    THEN true ELSE false
  END AS has_collegiate_history,
  CASE
    WHEN evidence.has_collegiate_school
      OR evidence.has_collegiate_team_season
      OR evidence.has_collegiate_individual_result
      OR evidence.has_collegiate_relay_result
    THEN 'collegiate_history'
    WHEN current_school.institution_type = 'unattached' THEN 'unresolved_unattached'
    ELSE COALESCE(current_school.institution_type, 'unknown')
  END AS classification
FROM public.athletes a
LEFT JOIN public.schools current_school ON current_school.school_id = a.school_id
CROSS JOIN LATERAL (
  SELECT
    (current_school.institution_type = 'collegiate') AS has_collegiate_school,
    EXISTS (
      SELECT 1
      FROM public.athlete_team_seasons ats
      JOIN public.teams team ON team.team_id = ats.team_id
      JOIN public.schools school ON school.school_id = team.school_id
      WHERE ats.athlete_id = a.athlete_id
        AND school.institution_type = 'collegiate'
    ) AS has_collegiate_team_season,
    EXISTS (
      SELECT 1
      FROM public.results result
      JOIN public.teams team ON team.team_id = result.team_id
      JOIN public.schools school ON school.school_id = team.school_id
      WHERE result.athlete_id = a.athlete_id
        AND school.institution_type = 'collegiate'
    ) AS has_collegiate_individual_result,
    EXISTS (
      SELECT 1
      FROM public.relay_athletes relay_athlete
      JOIN public.relay_results relay_result
        ON relay_result.relay_result_id = relay_athlete.relay_result_id
      JOIN public.teams team ON team.team_id = relay_result.team_id
      JOIN public.schools school ON school.school_id = team.school_id
      WHERE relay_athlete.athlete_id = a.athlete_id
        AND school.institution_type = 'collegiate'
    ) AS has_collegiate_relay_result
) evidence;

COMMENT ON COLUMN public.schools.institution_type IS
  'Reviewed school category. This classifies the school record, not every athlete currently assigned to it.';

COMMENT ON COLUMN public.divisions.classification_kind IS
  'Meaning of the legacy divisions row: division, association, league, or unknown.';

COMMENT ON VIEW public.v_athlete_collegiate_history IS
  'Internal read model for deterministic collegiate-history filtering. Does not infer affiliation from provider IDs.';

COMMIT;
