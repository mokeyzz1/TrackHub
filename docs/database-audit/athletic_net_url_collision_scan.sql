-- Read-only source-identity collision scan.
-- A shared Athletic.net URL is a review signal, not proof that the athlete rows are identical.

with collisions as (
  select lower(trim(a.athletic_net_url)) as athletic_net_url,
         substring(a.athletic_net_url from '/athlete/([0-9]+)') as external_key,
         count(*)::int as athlete_rows,
         count(distinct a.school_id)::int as school_count,
         count(distinct lower(regexp_replace(trim(a.full_name), '[^a-z0-9]+', '', 'g')))::int as name_count,
         count(distinct a.gender)::int as gender_count,
         array_agg(jsonb_build_object(
           'athlete_id', a.athlete_id,
           'full_name', a.full_name,
           'school_id', a.school_id,
           'gender', a.gender,
           'tfrrs_athlete_id', a.tfrrs_athlete_id
         ) order by a.athlete_id) as rows
  from public.athletes a
  where a.athletic_net_url is not null and trim(a.athletic_net_url) <> ''
  group by lower(trim(a.athletic_net_url)), substring(a.athletic_net_url from '/athlete/([0-9]+)')
  having count(*) > 1
)
select athletic_net_url, external_key, athlete_rows, school_count, name_count, gender_count, rows,
       case when school_count = 1 and name_count = 1 and gender_count <= 1
            then 'same_identity_shape'
            else 'mixed_identity_shape'
       end as review_bucket,
       exists (
         select 1 from public.external_ids e
         where e.source = 'athletic_net' and e.external_key = collisions.external_key
       ) as in_external_ids
from collisions
order by review_bucket, athlete_rows desc, athletic_net_url;

