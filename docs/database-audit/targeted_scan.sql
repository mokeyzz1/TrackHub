-- Read-only targeted audit queries for the live Supabase database.
SET statement_timeout = '15min';

\echo '== RLS coverage and policy counts =='
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS forced,
       count(p.policyname) AS policy_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
 WHERE n.nspname IN ('public','ingest') AND c.relkind = 'r'
 GROUP BY n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity
 ORDER BY n.nspname,c.relname;

\echo '== Security-definer routines =='
SELECT n.nspname AS schema_name, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer, p.proconfig AS config,
       COALESCE(array_to_string(p.proacl, E'\n'),'default') AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','ingest') AND p.prosecdef
 ORDER BY n.nspname,p.proname;

\echo '== Public views and options =='
SELECT schemaname, viewname, viewowner, definition
  FROM pg_views WHERE schemaname IN ('public','ingest') ORDER BY schemaname,viewname;

\echo '== Tables without a primary key =='
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.reltuples::bigint AS estimated_rows
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','ingest') AND c.relkind='r'
   AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p')
 ORDER BY n.nspname,c.relname;

\echo '== Constraints not validated or disabled =='
SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname,
       con.contype, con.convalidated, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','ingest') AND (NOT con.convalidated OR con.connoinherit)
 ORDER BY n.nspname,c.relname,con.conname;

\echo '== Duplicate school official names (normalized) =='
SELECT lower(regexp_replace(trim(official_name),'[^a-z0-9]+','','g')) AS normalized_name,
       count(*) AS school_count,
       string_agg(format('%s:%s (%s, %s)',school_id,official_name,city,state), ' | ' ORDER BY school_id) AS examples
  FROM public.schools
 WHERE official_name IS NOT NULL AND trim(official_name) <> ''
 GROUP BY 1 HAVING count(*) > 1 ORDER BY school_count DESC, normalized_name;

\echo '== Results integrity by date/linkage =='
SELECT CASE WHEN date IS NULL THEN '<null>' ELSE extract(year FROM date)::text END AS year,
       count(*) AS rows, count(*) FILTER (WHERE meet_id IS NULL) AS null_meet,
       count(*) FILTER (WHERE team_id IS NULL) AS null_team,
       count(*) FILTER (WHERE athlete_id IS NULL) AS null_athlete
  FROM public.results GROUP BY 1 ORDER BY 1;

\echo '== Relay integrity by event =='
SELECT event_type_id,event_name,count(*) AS rows,
       count(*) FILTER (WHERE meet_id IS NULL) AS null_meet,
       count(*) FILTER (WHERE team_id IS NULL) AS null_team,
       count(*) FILTER (WHERE mark_raw IS NULL) AS null_mark
  FROM public.relay_results GROUP BY 1,2 ORDER BY rows DESC;

\echo '== Queue scope/status matrix =='
SELECT scope_key,status,count(*) AS rows,min(created_at) AS first_created,max(updated_at) AS last_updated
  FROM ingest.event_recovery_queue GROUP BY scope_key,status ORDER BY scope_key,status;
SELECT scope_key,status,count(*) AS rows,min(created_at) AS first_created,max(updated_at) AS last_updated
  FROM ingest.recovery_queue GROUP BY scope_key,status ORDER BY scope_key,status;

\echo '== Provenance/linkage coverage =='
SELECT 'source_records' AS relation,count(*) AS rows FROM ingest.source_records
UNION ALL SELECT 'source_links',count(*) FROM ingest.source_links
UNION ALL SELECT 'observations',count(*) FROM ingest.observations
UNION ALL SELECT 'source_records_no_hash',count(*) FROM ingest.source_records WHERE payload_hash IS NULL
UNION ALL SELECT 'observations_no_canonical_target',count(*) FROM ingest.observations WHERE canonical_result_id IS NULL AND canonical_relay_id IS NULL;
