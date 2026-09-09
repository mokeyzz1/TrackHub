-- Guarded rollback for migration 20260903200000_apply_reviewed_4x100_team_links.sql.
-- It restores only the 24 archived rows when their current team_id still equals the value that
-- the reviewed migration assigned. If any row was changed afterward, the transaction aborts.

BEGIN;

DO $$
DECLARE
  operation constant text := '20260903_reviewed_4x100_team_links';
  expected_count integer := 24;
  archive_count integer;
  changed_count integer;
BEGIN
  SELECT count(*) INTO archive_count
    FROM ingest.fact_cleanup_archive
   WHERE operation_key = operation
     AND source_table = 'public.relay_results';
  IF archive_count = 0 THEN
    RAISE NOTICE 'no reviewed 4x100 team-link archive found; nothing to roll back';
    RETURN;
  END IF;
  IF archive_count <> expected_count THEN
    RAISE EXCEPTION 'expected % archived team links, found %', expected_count, archive_count;
  END IF;

  IF (SELECT count(*)
        FROM public.relay_results rr
        JOIN (VALUES
          (231307::bigint,997),(233375,997),(235273,2095),(211000,3627),(235031,3653),
          (235033,3653),(235034,3627),(235036,3619),(235039,3653),(235053,3620),
          (234895,1917),(234952,3617),(234953,3615),(234955,3651),(234960,3664),
          (234821,1989),(218259,997),(234342,3326),(234343,998),(234264,1241),
          (233061,1988),(233071,1988),(233088,1989),(233097,1989)
        ) AS expected(relay_result_id, team_id)
          ON expected.relay_result_id = rr.relay_result_id
       WHERE rr.team_id IS DISTINCT FROM expected.team_id) <> 0 THEN
    RAISE EXCEPTION 'one or more reviewed rows no longer has its assigned team_id; aborting rollback';
  END IF;

  UPDATE public.relay_results rr
     SET team_id = NULL
    FROM (VALUES
      (231307::bigint,997),(233375,997),(235273,2095),(211000,3627),(235031,3653),
      (235033,3653),(235034,3627),(235036,3619),(235039,3653),(235053,3620),
      (234895,1917),(234952,3617),(234953,3615),(234955,3651),(234960,3664),
      (234821,1989),(218259,997),(234342,3326),(234343,998),(234264,1241),
      (233061,1988),(233071,1988),(233088,1989),(233097,1989)
    ) AS expected(relay_result_id, assigned_team_id)
   WHERE rr.relay_result_id = expected.relay_result_id
     AND rr.team_id = expected.assigned_team_id;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> expected_count THEN
    RAISE EXCEPTION 'expected % rollback updates, applied %', expected_count, changed_count;
  END IF;
END
$$;

COMMIT;

