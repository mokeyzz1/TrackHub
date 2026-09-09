-- Read-only production scan for the private ingest/provenance control plane.
-- No statement in this file writes rows, changes DDL, or changes access policy.

-- 1. Exact cardinalities for every ingest table.
select 'athlete_aliases' as table_name, count(*) as row_count from ingest.athlete_aliases
union all select 'event_recovery_queue', count(*) from ingest.event_recovery_queue
union all select 'fact_cleanup_archive', count(*) from ingest.fact_cleanup_archive
union all select 'observations', count(*) from ingest.observations
union all select 'quarantine', count(*) from ingest.quarantine
union all select 'recovery_queue', count(*) from ingest.recovery_queue
union all select 'runs', count(*) from ingest.runs
union all select 'source_links', count(*) from ingest.source_links
union all select 'source_records', count(*) from ingest.source_records
union all select 'team_aliases', count(*) from ingest.team_aliases
order by table_name;

-- 2. Column inventory (the contract is visible without copying data).
select table_name,
       string_agg(column_name || ' ' || data_type ||
                  case when is_nullable = 'NO' then ' NOT NULL' else '' end,
                  ', ' order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'ingest'
group by table_name
order by table_name;

-- 3. Raw source-record coverage and optional lineage fields.
select source,
       count(*) as rows,
       count(distinct source_meet_key) as meet_keys,
       count(distinct source_event_key) as event_keys,
       count(*) filter (where source_url is null) as missing_source_url,
       count(*) filter (where payload_hash is null) as missing_payload_hash,
       min(first_seen_at) as first_seen_at,
       max(last_seen_at) as last_seen_at
from ingest.source_records
group by source
order by source;

-- 4. Source records that have not yet been linked to a canonical fact.
select
  (select count(*) from ingest.source_records) as source_records,
  (select count(*) from ingest.source_links) as source_links,
  (select count(*) from ingest.source_records sr
   left join ingest.source_links sl using (source_record_id)
   where sl.source_record_id is null) as records_without_link,
  (select count(*) from ingest.source_links sl
   left join ingest.source_records sr using (source_record_id)
   where sr.source_record_id is null) as orphan_links;

select sr.source, count(*) as records_without_link
from ingest.source_records sr
left join ingest.source_links sl using (source_record_id)
where sl.source_record_id is null
group by sr.source
order by sr.source;

select sr.source, sl.entity_type, sl.link_status, count(*) as rows
from ingest.source_links sl
join ingest.source_records sr using (source_record_id)
group by sr.source, sl.entity_type, sl.link_status
order by sr.source, sl.entity_type, sl.link_status;

-- 5. Normalized observation decisions and referential completeness.
select entity_type, decision, count(*) as rows
from ingest.observations
group by entity_type, decision
order by entity_type, decision;

select count(*) as observations,
       count(*) filter (where source_record_id is null) as missing_source_record,
       count(*) filter (where run_id is null) as missing_run,
       count(*) filter (where decision = 'pending') as pending,
       count(*) filter (where decision <> 'pending') as decided,
       count(*) filter (where decision = 'insert'
                         and entity_type = 'individual_result'
                         and canonical_result_id is null) as invalid_individual_inserts,
       count(*) filter (where decision = 'insert'
                         and entity_type = 'relay_result'
                         and canonical_relay_id is null) as invalid_relay_inserts
from ingest.observations;

-- 6. Quarantine review state and reason mix.
select reason_code, status, count(*) as rows
from ingest.quarantine
group by reason_code, status
order by reason_code, status;

-- 7. Verified source aliases and uniqueness/orphan checks.
select 'athlete_aliases' as table_name, source, status, match_method, count(*) as rows
from ingest.athlete_aliases
group by source, status, match_method
union all
select 'team_aliases', source, status, match_method, count(*)
from ingest.team_aliases
group by source, status, match_method
order by table_name, source, status, match_method;

select
  (select count(*) from ingest.athlete_aliases aa
   left join public.athletes a on a.athlete_id = aa.target_athlete_id
   where a.athlete_id is null) as athlete_alias_orphans,
  (select count(*) from ingest.team_aliases ta
   left join public.teams t on t.team_id = ta.team_id
   where t.team_id is null) as team_alias_orphans,
  (select count(*) from (
     select source, source_athlete_key
     from ingest.athlete_aliases
     group by source, source_athlete_key
     having count(*) > 1
   ) x) as duplicate_athlete_alias_keys,
  (select count(*) from (
     select source, normalized_source_team_key, source_gender
     from ingest.team_aliases
     group by source, normalized_source_team_key, source_gender
     having count(*) > 1
   ) x) as duplicate_team_alias_keys;

-- 8. The general meet queue and the paused 4x100 meet/event queue are separate contracts.
select 'recovery_queue' as table_name, scope_key, status, coverage_status, count(*) as rows
from ingest.recovery_queue
group by scope_key, status, coverage_status
union all
select 'event_recovery_queue', scope_key, status, event_code, count(*)
from ingest.event_recovery_queue
group by scope_key, status, event_code
order by table_name, scope_key, status;

-- 9. Queue foreign-key health and run lifecycle.
select 'recovery_queue.meet_id' as relationship, count(*) as orphan_rows
from ingest.recovery_queue q
left join public.meets m on m.meet_id = q.meet_id
where m.meet_id is null
union all
select 'event_recovery_queue.meet_id', count(*)
from ingest.event_recovery_queue q
left join public.meets m on m.meet_id = q.meet_id
where m.meet_id is null
order by relationship;

select source, mode, status, count(*) as rows
from ingest.runs
group by source, mode, status
order by source, mode, status;

select run_id, source, mode, status, scope, started_at, finished_at
from ingest.runs
where status = 'running'
order by started_at;

-- 10. Before-image cleanup archive by operation and source surface.
select operation_key, source_table, count(*) as rows,
       min(archived_at) as first_archived,
       max(archived_at) as last_archived
from ingest.fact_cleanup_archive
group by operation_key, source_table
order by first_archived, operation_key, source_table;

-- 11. Constraints and referential actions.
select c.relname as table_name,
       con.conname as constraint_name,
       case con.contype when 'p' then 'PRIMARY KEY'
                        when 'u' then 'UNIQUE'
                        when 'f' then 'FOREIGN KEY'
                        when 'c' then 'CHECK' end as constraint_type,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'ingest'
  and con.contype in ('p','u','f','c')
order by c.relname, con.conname;

-- 12. RLS and public-role boundary. Empty pg_policies is intentional default-deny here.
select c.relname as table_name, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'ingest' and c.relkind = 'r'
order by c.relname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'ingest'
order by tablename, policyname;

select
  has_schema_privilege('anon', 'ingest', 'USAGE') as anon_schema_usage,
  has_schema_privilege('authenticated', 'ingest', 'USAGE') as authenticated_schema_usage,
  has_schema_privilege('service_role', 'ingest', 'USAGE') as service_schema_usage,
  has_schema_privilege('postgres', 'ingest', 'USAGE') as postgres_schema_usage,
  has_schema_privilege('anon', 'ingest', 'CREATE') as anon_schema_create,
  has_schema_privilege('authenticated', 'ingest', 'CREATE') as authenticated_schema_create,
  has_schema_privilege('service_role', 'ingest', 'CREATE') as service_schema_create,
  has_schema_privilege('postgres', 'ingest', 'CREATE') as postgres_schema_create;

-- 13. Function execution boundary, including the trigger helper.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.proacl,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
       has_function_privilege('postgres', p.oid, 'EXECUTE') as postgres_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'ingest'
order by p.proname, pg_get_function_identity_arguments(p.oid);

select c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'ingest' and not t.tgisinternal
order by c.relname, t.tgname;
