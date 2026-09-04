-- Read-only meet identity/provenance audit.
-- Run against production with a read-only role. This file intentionally contains no writes.

-- 1. Coverage of canonical and source/provenance columns.
select
  count(*)::bigint as meets,
  count(*) filter (where location is null or btrim(location) = '')::bigint as missing_location,
  count(*) filter (where meet_url is null or btrim(meet_url) = '')::bigint as missing_meet_url,
  count(*) filter (where source_url is null or btrim(source_url) = '')::bigint as missing_source_url,
  count(*) filter (where tfrrs_meet_id is null or btrim(tfrrs_meet_id) = '')::bigint as missing_tfrrs_meet_id,
  count(*) filter (where tfrrs_url is null or btrim(tfrrs_url) = '')::bigint as missing_tfrrs_url,
  count(*) filter (where athletic_net_results_url is null or btrim(athletic_net_results_url) = '')::bigint as missing_athletic_net_url,
  count(*) filter (where wa_results_url is null or btrim(wa_results_url) = '')::bigint as missing_wa_url,
  count(*) filter (where end_date is null)::bigint as missing_end_date,
  count(*) filter (where level is null or btrim(level) = '')::bigint as missing_level,
  count(*) filter (where timing_platform is null or btrim(timing_platform) = '')::bigint as missing_timing_platform,
  count(*) filter (where results_source is null or btrim(results_source) = '')::bigint as missing_results_source
from public.meets;

-- 2. Controlled vocabularies. Preserve raw values until a mapping is approved.
select coalesce(nullif(btrim(status), ''), '[NULL/blank]') as status,
       count(*)::bigint as rows
from public.meets group by 1 order by rows desc, status;

select coalesce(nullif(btrim(season), ''), '[NULL/blank]') as season,
       count(*)::bigint as rows
from public.meets group by 1 order by rows desc, season;

select coalesce(nullif(btrim(timing_platform), ''), '[NULL/blank]') as timing_platform,
       count(*)::bigint as rows
from public.meets group by 1 order by rows desc, timing_platform;

select coalesce(nullif(btrim(results_source), ''), '[NULL/blank]') as results_source,
       count(*)::bigint as rows
from public.meets group by 1 order by rows desc, results_source;

-- 3. A source URL is a candidate alias, not a uniqueness key, until all owners agree.
select lower(regexp_replace(btrim(tfrrs_url), '/+$', '')) as url_key,
       count(*)::bigint as rows,
       array_agg(meet_id order by meet_id) as meet_ids
from public.meets
where tfrrs_url is not null and btrim(tfrrs_url) <> ''
group by 1 having count(*) > 1
order by rows desc, url_key;

select lower(regexp_replace(btrim(athletic_net_results_url), '/+$', '')) as url_key,
       count(*)::bigint as rows,
       array_agg(meet_id order by meet_id) as meet_ids
from public.meets
where athletic_net_results_url is not null and btrim(athletic_net_results_url) <> ''
group by 1 having count(*) > 1
order by rows desc, url_key;

-- 4. Name/date collisions are review candidates, not automatic duplicates.
select lower(regexp_replace(name, '[^a-z0-9]+', '', 'gi')) as name_key,
       date,
       count(*)::bigint as rows,
       array_agg(meet_id order by meet_id) as meet_ids,
       array_agg(name order by meet_id) as names
from public.meets
group by 1, date having count(*) > 1
order by rows desc, date, name_key;

-- 5. Show source-column disagreement for rows that share one URL.
with duplicate_urls as (
  select lower(regexp_replace(btrim(tfrrs_url), '/+$', '')) as url_key
  from public.meets
  where tfrrs_url is not null and btrim(tfrrs_url) <> ''
  group by 1 having count(*) > 1
)
select m.meet_id,m.name,m.date,m.end_date,m.location,m.status,m.season,
       m.tfrrs_url,m.tfrrs_meet_id,m.results_source,m.results_status
from public.meets m
join duplicate_urls d on d.url_key=lower(regexp_replace(btrim(m.tfrrs_url), '/+$', ''))
order by m.tfrrs_url,m.date,m.meet_id;

-- 6. Same-URL result-set fingerprints. Equal fingerprints are review evidence, not a delete command.
with duplicate_meets as (
  select lower(regexp_replace(btrim(tfrrs_url), '/+$', '')) as url_key,
         array_agg(meet_id order by meet_id) as meet_ids
  from public.meets
  where tfrrs_url is not null and btrim(tfrrs_url) <> ''
  group by 1 having count(*) > 1
), facts as (
  select d.url_key,m.meet_id,
    (select count(*) from public.results r where r.meet_id=m.meet_id)::bigint as result_rows,
    (select md5(coalesce(string_agg(
      md5(concat_ws('|',coalesce(r.athlete_id::text,''),coalesce(r.event_type_id::text,''),
          coalesce(r.team_id::text,''),coalesce(r.mark_raw,''),coalesce(r.place::text,''),coalesce(r.round,''))),
      ',' order by r.athlete_id,r.event_type_id,r.team_id,r.mark_raw,r.place,r.round),''))
     from public.results r where r.meet_id=m.meet_id) as result_fingerprint,
    (select count(*) from public.relay_results rr where rr.meet_id=m.meet_id)::bigint as relay_rows,
    (select md5(coalesce(string_agg(
      md5(concat_ws('|',coalesce(rr.event_type_id::text,''),coalesce(rr.team_id::text,''),
          coalesce(rr.mark_raw,''),coalesce(rr.place::text,''),coalesce(rr.round,''))),
      ',' order by rr.event_type_id,rr.team_id,rr.mark_raw,rr.place,rr.round),''))
     from public.relay_results rr where rr.meet_id=m.meet_id) as relay_fingerprint
  from duplicate_meets d join public.meets m on m.meet_id=any(d.meet_ids)
)
select * from facts order by url_key,meet_id;
