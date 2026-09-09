BEGIN;

-- Owner-reviewed first cohort only. This migration is intentionally prepared but must not be
-- applied until the candidate report has been approved. It changes only nullable affiliation
-- fields and archives complete before-images in the existing private archive.
DO $$
DECLARE
  operation text := '20260904_reviewed_explicit_team_affiliations_v1';
  archived_count integer;
  updated_count integer;
  remaining_count integer;
BEGIN
  IF (SELECT count(*) FROM public.teams WHERE team_id IN (3611, 3612, 3605, 713, 714, 1350, 1351)
      AND team_name IS NULL AND team_type IS NULL) <> 7 THEN
    RAISE EXCEPTION 'affiliation cohort precondition failed';
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.teams', t.team_id::text, to_jsonb(t)
    FROM public.teams t
   WHERE t.team_id IN (3611, 3612, 3605, 713, 714, 1350, 1351)
   ON CONFLICT (operation_key, source_table, source_pk) DO NOTHING;

  SELECT count(*) INTO archived_count
    FROM ingest.fact_cleanup_archive
   WHERE operation_key = operation AND source_table = 'public.teams';
  IF archived_count <> 7 THEN
    RAISE EXCEPTION 'expected 7 archived team before-images, found %', archived_count;
  END IF;

  WITH proposed(team_id, expected_gender, proposed_name, proposed_type) AS (
    VALUES
      (3611::bigint, 'M', 'Unattached', 'unattached'),
      (3612::bigint, 'F', 'Unattached', 'unattached'),
      (3605::bigint, 'M', 'Dawgs Track Club', 'club'),
      (713::bigint, 'M', 'Academy of Art', 'collegiate'),
      (714::bigint, 'F', 'Academy of Art', 'collegiate'),
      (1350::bigint, 'M', 'Alliant International', 'collegiate'),
      (1351::bigint, 'F', 'Alliant International', 'collegiate')
  )
  UPDATE public.teams t
     SET team_name = p.proposed_name,
         team_type = p.proposed_type,
         updated_at = now()
    FROM proposed p
   WHERE t.team_id = p.team_id
     AND t.gender = p.expected_gender
     AND t.team_name IS NULL
     AND t.team_type IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 7 THEN
    RAISE EXCEPTION 'expected 7 team rows updated, found %', updated_count;
  END IF;

  SELECT count(*) INTO remaining_count
    FROM public.teams
   WHERE team_id IN (3611, 3612, 3605, 713, 714, 1350, 1351)
     AND (team_name IS NULL OR team_type IS NULL);
  IF remaining_count <> 0 THEN
    RAISE EXCEPTION 'affiliation postcondition failed for % rows', remaining_count;
  END IF;
END
$$;

COMMIT;
