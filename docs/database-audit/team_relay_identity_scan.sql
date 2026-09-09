-- Read-only team/relay identity audit.
-- Run against production with a read-only role. This file intentionally contains no writes.

-- 1. Team identity coverage and label vocabulary.
select
  count(*)::bigint as teams,
  count(*) filter (where team_name is null or btrim(team_name) = '')::bigint as missing_team_name,
  count(*) filter (where team_type is null or btrim(team_type) = '')::bigint as missing_team_type,
  count(*) filter (where tfrrs_team_url is null or btrim(tfrrs_team_url) = '')::bigint as missing_tfrrs_url,
  count(*) filter (where athletic_net_url is null or btrim(athletic_net_url) = '')::bigint as missing_athletic_net_url,
  count(*) filter (where is_active)::bigint as active,
  count(*) filter (where not is_active)::bigint as inactive
from public.teams;

select coalesce(nullif(btrim(team_type), ''), '[NULL/blank]') as team_type,
       count(*)::bigint as rows
from public.teams
group by 1
order by rows desc, team_type;

-- 2. Source identifiers must not be merged by display name.
select lower(btrim(tfrrs_team_url)) as url_key,
       count(*)::bigint as rows,
       array_agg(team_id order by team_id) as team_ids
from public.teams
where tfrrs_team_url is not null and btrim(tfrrs_team_url) <> ''
group by 1
having count(*) > 1
order by rows desc, url_key;

select lower(btrim(athletic_net_url)) as url_key,
       count(*)::bigint as rows,
       array_agg(team_id order by team_id) as team_ids
from public.teams
where athletic_net_url is not null and btrim(athletic_net_url) <> ''
group by 1
having count(*) > 1
order by rows desc, url_key;

-- 3. Name collisions are only candidates when school and gender also agree.
select school_id,
       lower(regexp_replace(coalesce(team_name, ''), '[^a-z0-9]+', '', 'gi')) as name_key,
       lower(btrim(gender)) as gender_key,
       count(*)::bigint as rows,
       array_agg(team_id order by team_id) as team_ids
from public.teams
group by school_id,
         lower(regexp_replace(coalesce(team_name, ''), '[^a-z0-9]+', '', 'gi')),
         lower(btrim(gender))
having count(*) > 1
order by rows desc, school_id, name_key, gender_key;

-- 4. Team rows used by canonical facts. A team with no facts is not automatically disposable.
select
  (select count(distinct team_id) from public.results where team_id is not null)::bigint as result_team_ids,
  (select count(distinct team_id) from public.relay_results where team_id is not null)::bigint as relay_team_ids,
  (select count(*) from public.teams t where exists
     (select 1 from public.results r where r.team_id = t.team_id))::bigint as teams_with_results,
  (select count(*) from public.teams t where exists
     (select 1 from public.relay_results rr where rr.team_id = t.team_id))::bigint as teams_with_relays,
  (select count(*) from public.teams t where not exists
     (select 1 from public.results r where r.team_id = t.team_id)
     and not exists (select 1 from public.relay_results rr where rr.team_id = t.team_id))::bigint as teams_without_facts;

-- 5. Relay parent/leg shape and candidate anomalies.
select
  count(*)::bigint as relay_legs,
  count(*) filter (where relay_result_id is null)::bigint as null_parent,
  count(*) filter (where athlete_id is null)::bigint as null_athlete,
  count(*) filter (where leg_order is null)::bigint as null_leg_order,
  count(*) filter (where leg_order is not null and leg_order < 1)::bigint as nonpositive_leg_order,
  count(*) filter (where athlete_name is null or btrim(athlete_name) = '')::bigint as missing_athlete_name,
  count(*) filter (where tfrrs_athlete_id is null or btrim(tfrrs_athlete_id) = '')::bigint as missing_tfrrs_id
from public.relay_athletes;

select relay_result_id, leg_order, count(*)::bigint as rows,
       array_agg(relay_athlete_id order by relay_athlete_id) as relay_athlete_ids
from public.relay_athletes
where relay_result_id is not null and leg_order is not null
group by relay_result_id, leg_order
having count(*) > 1
order by rows desc, relay_result_id;

with same_athlete as (
  select relay_result_id, athlete_id, count(*) as rows
  from public.relay_athletes
  where relay_result_id is not null and athlete_id is not null
  group by relay_result_id, athlete_id
  having count(*) > 1
)
select count(*)::bigint as duplicate_athlete_groups,
       coalesce(sum(rows - 1), 0)::bigint as duplicate_athlete_extra_rows
from same_athlete;

-- 6. Parent links remain nullable because historical/unattached relays exist.
select
  count(*)::bigint as relay_parents,
  count(*) filter (where meet_id is null)::bigint as null_meet,
  count(*) filter (where team_id is null)::bigint as null_team,
  count(*) filter (where event_type_id is null)::bigint as null_event_type,
  count(*) filter (where mark_raw is null or btrim(mark_raw) = '')::bigint as missing_mark,
  count(*) filter (where date is null)::bigint as null_date
from public.relay_results;

-- 7. A relay source ID should resolve to one canonical athlete. Conflicts are review-only.
with conflicting_source_ids as (
  select lower(btrim(tfrrs_athlete_id)) as source_key
  from public.relay_athletes
  where tfrrs_athlete_id is not null and btrim(tfrrs_athlete_id) <> ''
  group by lower(btrim(tfrrs_athlete_id))
  having count(distinct athlete_id) > 1
), tagged as (
  select ra.relay_athlete_id,
         ra.created_at,
         ra.athlete_name,
         a.full_name,
         case when lower(btrim(a.tfrrs_athlete_id)) = lower(btrim(ra.tfrrs_athlete_id))
              then 'canonical_match' else 'canonical_mismatch' end as bucket
  from public.relay_athletes ra
  join conflicting_source_ids c
    on c.source_key = lower(btrim(ra.tfrrs_athlete_id))
  join public.athletes a on a.athlete_id = ra.athlete_id
  where ra.tfrrs_athlete_id is not null and btrim(ra.tfrrs_athlete_id) <> ''
)
select bucket,
       count(*)::bigint as relay_rows,
       count(distinct relay_athlete_id)::bigint as legs,
       min(created_at) as first_created,
       max(created_at) as last_created,
       count(*) filter (where lower(regexp_replace(coalesce(athlete_name, ''), '[^a-z0-9]+', '', 'gi'))
                              <> lower(regexp_replace(coalesce(full_name, ''), '[^a-z0-9]+', '', 'gi')))::bigint
         as display_name_mismatches
from tagged
group by bucket
order by bucket;
