-- Guarded rollback for migration
-- 20260904210000_repair_source_backed_relay_athlete_links.sql.
-- It restores only the two archived rows when their current links still equal the reviewed
-- target. If either row was changed afterward, the transaction aborts instead of overwriting it.

BEGIN;

DO $$
DECLARE
  operation constant text := '20260904_repair_source_backed_relay_athlete_links_v1';
  archive_count integer;
  restored_count integer;
BEGIN
  SELECT count(*) INTO archive_count
    FROM ingest.fact_cleanup_archive
   WHERE operation_key = operation
     AND source_table = 'public.relay_athletes';

  IF archive_count = 0 THEN
    RAISE NOTICE 'no source-backed relay-link archive found; nothing to roll back';
    RETURN;
  END IF;
  IF archive_count <> 2 THEN
    RAISE EXCEPTION 'expected two archived relay links, found %', archive_count;
  END IF;

  IF (SELECT count(*)
        FROM public.relay_athletes ra
        JOIN (VALUES
          (445111::integer, 193435::integer),
          (467775::integer, 194385::integer)
        ) AS expected(relay_athlete_id, target_athlete_id)
          ON expected.relay_athlete_id = ra.relay_athlete_id
       WHERE ra.athlete_id = expected.target_athlete_id) <> 2 THEN
    RAISE EXCEPTION 'one or more reviewed relay links no longer has its assigned target; aborting rollback';
  END IF;

  UPDATE public.relay_athletes ra
     SET athlete_id = (archive.row_data->>'athlete_id')::integer
    FROM ingest.fact_cleanup_archive archive
   WHERE archive.operation_key = operation
     AND archive.source_table = 'public.relay_athletes'
     AND archive.source_pk = ra.relay_athlete_id::text;
  GET DIAGNOSTICS restored_count = ROW_COUNT;
  IF restored_count <> 2 THEN
    RAISE EXCEPTION 'expected two relay links restored, found %', restored_count;
  END IF;
END
$$;

COMMIT;
