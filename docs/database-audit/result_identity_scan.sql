-- Read-only individual-result identity audit.
-- Run against production with a read-only role. This file intentionally contains no writes.

-- 1. Required and legacy/context field coverage.
select
  count(*)::bigint as rows,
  count(*) filter (where athlete_id is null)::bigint as null_athlete_id,
  count(*) filter (where team_id is null)::bigint as null_team_id,
  count(*) filter (where meet_id is null)::bigint as null_meet_id,
  count(*) filter (where event_type_id is null)::bigint as null_event_type_id,
  count(*) filter (where event_id is null)::bigint as null_legacy_event_id,
  count(*) filter (where date is null)::bigint as null_date,
  count(*) filter (where meet_name is null or btrim(meet_name) = '')::bigint as null_meet_name,
  count(*) filter (where season_code is null or btrim(season_code) = '')::bigint as null_season_code,
  count(*) filter (where environment is null or btrim(environment) = '')::bigint as null_environment,
  count(*) filter (where round is null or btrim(round) = '')::bigint as null_round,
  count(*) filter (where mark_seconds is null)::bigint as null_mark_seconds,
  count(*) filter (where mark_meters is null)::bigint as null_mark_meters,
  count(*) filter (where mark_feet is null or btrim(mark_feet) = '')::bigint as null_mark_feet
from public.results;

-- 2. Any unlinked duplicate must include identical source context before review.
select athlete_id,event_type_id,
       coalesce(meet_name,'') as meet_name,
       coalesce(date::text,'') as date,
       mark_raw,place,round,
       count(*)::bigint as rows
from public.results
where meet_id is null
group by athlete_id,event_type_id,coalesce(meet_name,''),coalesce(date::text,''),mark_raw,place,round
having count(*) > 1
order by rows desc
limit 100;

-- 3. Verify the existing linked-result identity indexes and validity.
select indexrelid::regclass as index_name,
       indisunique,
       indisvalid,
       pg_get_indexdef(indexrelid) as definition
from pg_index
where indexrelid::regclass::text in
  ('public.results_no_exact_duplicate','public.results_no_dup_normmark')
order by index_name;

-- 4. Status rows are source values, not null marks to delete.
select mark_raw,count(*)::bigint as rows
from public.results
where mark_raw in ('NT','DNS','DNF','DQ','SCR','NM','FOUL')
group by mark_raw order by mark_raw;
