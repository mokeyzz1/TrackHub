-- Read-only relay-leg identity review.
-- This file intentionally contains no writes, deletes, or constraint changes.

-- 1. Repeated internal athlete groups within one relay parent.
-- A repeat is only a cleanup candidate if the parent, athlete, and leg slot
-- are identical. Different leg slots may be source structure or a bad parse.
with same_athlete as (
  select relay_result_id,
         athlete_id,
         count(*)::bigint as row_count,
         count(distinct leg_order)::bigint as distinct_leg_orders,
         count(*) filter (where tfrrs_athlete_id is not null and btrim(tfrrs_athlete_id) <> '')::bigint
           as rows_with_source_id,
         count(*) filter (where athlete_name is not null and btrim(athlete_name) <> '')::bigint
           as rows_with_name
  from public.relay_athletes
  where relay_result_id is not null
    and athlete_id is not null
  group by relay_result_id, athlete_id
  having count(*) > 1
)
select distinct_leg_orders,
       count(*)::bigint as groups,
       sum(row_count - 1)::bigint as extra_rows,
       sum(rows_with_source_id)::bigint as rows_with_source_id,
       sum(rows_with_name)::bigint as rows_with_name
from same_athlete
group by distinct_leg_orders
order by distinct_leg_orders;

-- 2. Exact same parent + athlete + leg slot duplicates.
-- These are the only rows that can be called exact duplicates from this key.
with exact_duplicates as (
  select relay_result_id,
         athlete_id,
         leg_order,
         count(*)::bigint as row_count
  from public.relay_athletes
  where relay_result_id is not null
    and athlete_id is not null
    and leg_order is not null
  group by relay_result_id, athlete_id, leg_order
  having count(*) > 1
)
select count(*)::bigint as groups,
       coalesce(sum(row_count - 1), 0)::bigint as extra_rows
from exact_duplicates;

-- 3. Which leg-order pairs account for the repeated groups?
with same_athlete as (
  select relay_result_id,
         athlete_id,
         count(*)::bigint as row_count,
         array_agg(distinct leg_order order by leg_order) as leg_orders
  from public.relay_athletes
  where relay_result_id is not null
    and athlete_id is not null
  group by relay_result_id, athlete_id
  having count(*) > 1
)
select leg_orders::text as leg_order_pair,
       count(*)::bigint as groups,
       sum(row_count - 1)::bigint as extra_rows
from same_athlete
group by leg_orders
order by groups desc, leg_order_pair;

-- 4. Conflicting non-empty TFRRS athlete IDs attached to multiple internal athletes.
-- The canonical match/mismatch labels are evidence only; they do not authorize a
-- reassignment because relay legs currently have no source-record ownership key.
with conflicting_source_ids as (
  select lower(btrim(tfrrs_athlete_id)) as source_key
  from public.relay_athletes
  where tfrrs_athlete_id is not null
    and btrim(tfrrs_athlete_id) <> ''
  group by lower(btrim(tfrrs_athlete_id))
  having count(distinct athlete_id) > 1
), tagged as (
  select ra.relay_result_id,
         rr.meet_id,
         rr.date,
         lower(btrim(ra.tfrrs_athlete_id)) as source_key,
         case when lower(btrim(a.tfrrs_athlete_id)) = lower(btrim(ra.tfrrs_athlete_id))
              then 'canonical_match' else 'canonical_mismatch' end as bucket,
         ra.athlete_name,
         a.full_name
  from public.relay_athletes ra
  join conflicting_source_ids c
    on c.source_key = lower(btrim(ra.tfrrs_athlete_id))
  join public.relay_results rr
    on rr.relay_result_id = ra.relay_result_id
  left join public.athletes a
    on a.athlete_id = ra.athlete_id
)
select bucket,
       count(*)::bigint as rows,
       count(distinct source_key)::bigint as source_ids,
       count(distinct relay_result_id)::bigint as parents,
       count(distinct meet_id)::bigint as meets,
       min(date) as first_date,
       max(date) as last_date,
       count(*) filter (where lower(regexp_replace(coalesce(athlete_name, ''), '[^a-z0-9]+', '', 'gi'))
                              <> lower(regexp_replace(coalesce(full_name, ''), '[^a-z0-9]+', '', 'gi')))::bigint
         as display_name_mismatches
from tagged
group by bucket
order by bucket;

-- 5. Distribution of conflict-ID row counts.
with conflicting_source_ids as (
  select lower(btrim(tfrrs_athlete_id)) as source_key
  from public.relay_athletes
  where tfrrs_athlete_id is not null
    and btrim(tfrrs_athlete_id) <> ''
  group by lower(btrim(tfrrs_athlete_id))
  having count(distinct athlete_id) > 1
), per_source_id as (
  select lower(btrim(ra.tfrrs_athlete_id)) as source_key,
         count(*)::bigint as relay_rows,
         count(distinct ra.relay_result_id)::bigint as parents
  from public.relay_athletes ra
  join conflicting_source_ids c
    on c.source_key = lower(btrim(ra.tfrrs_athlete_id))
  group by lower(btrim(ra.tfrrs_athlete_id))
)
select count(*)::bigint as source_ids,
       min(relay_rows)::bigint as min_rows_per_id,
       max(relay_rows)::bigint as max_rows_per_id,
       round(avg(relay_rows), 2) as avg_rows_per_id,
       min(parents)::bigint as min_parents_per_id,
       max(parents)::bigint as max_parents_per_id
from per_source_id;
