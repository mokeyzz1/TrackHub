-- Roll back only the 341 source identities inserted by
-- 20260902144458_preserve_reviewed_secondary_athlete_identities.sql.
-- Run manually after reviewing the exact operation marker and row counts.

BEGIN;

CREATE TEMP TABLE _rollback_reviewed_athlete_identities ON COMMIT DROP AS
SELECT source, source_athlete_key AS source_key, target_athlete_id
  FROM ingest.athlete_aliases
 WHERE notes LIKE '20260902_preserve_reviewed_secondary_athlete_identities:%'
   AND status = 'active';

DO $$
BEGIN
  IF (SELECT count(*) FROM _rollback_reviewed_athlete_identities) <> 341 THEN
    RAISE EXCEPTION 'rollback requires exactly 341 operation-owned athlete aliases';
  END IF;

  IF (SELECT count(*)
        FROM _rollback_reviewed_athlete_identities k
        JOIN public.external_ids x
          ON x.source = k.source AND x.external_key = k.source_key
         AND x.athlete_id = k.target_athlete_id AND x.verified IS TRUE) <> 341 THEN
    RAISE EXCEPTION 'rollback external identity set does not match the operation-owned aliases';
  END IF;
END
$$;

DELETE FROM public.external_ids x
 USING _rollback_reviewed_athlete_identities k
 WHERE x.source = k.source
   AND x.external_key = k.source_key
   AND x.athlete_id = k.target_athlete_id
   AND x.verified IS TRUE;

DELETE FROM ingest.athlete_aliases a
 USING _rollback_reviewed_athlete_identities k
 WHERE a.source = k.source
   AND a.source_athlete_key = k.source_key
   AND a.target_athlete_id = k.target_athlete_id
   AND a.notes LIKE '20260902_preserve_reviewed_secondary_athlete_identities:%';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM _rollback_reviewed_athlete_identities k
      JOIN public.external_ids x
        ON x.source = k.source AND x.external_key = k.source_key
  ) OR EXISTS (
    SELECT 1
      FROM _rollback_reviewed_athlete_identities k
      JOIN ingest.athlete_aliases a
        ON a.source = k.source AND a.source_athlete_key = k.source_key
  ) THEN
    RAISE EXCEPTION 'reviewed athlete identity rollback left operation rows behind';
  END IF;
END
$$;

COMMIT;
