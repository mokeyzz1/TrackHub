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

-- 7. When private source records exist, show which canonical meet currently owns the links.
with duplicate_urls as (
  select lower(regexp_replace(btrim(tfrrs_url), '/+$', '')) as url_key,
         regexp_replace(lower(regexp_replace(btrim(tfrrs_url), '/+$', '')),
                         '^.*?/results/', '') as source_meet_key
  from public.meets
  where tfrrs_url is not null and btrim(tfrrs_url) <> ''
  group by 1
  having count(*) > 1
)
select d.url_key,
       d.source_meet_key,
       count(sr.source_record_id) as source_records,
       count(distinct sr.source_event_key) as event_keys,
       count(distinct case
         when sl.result_id is not null then r.meet_id
         when sl.relay_result_id is not null then rr.meet_id
       end) as linked_meets
from duplicate_urls d
left join ingest.source_records sr
  on sr.source = 'tfrrs' and sr.source_meet_key = d.source_meet_key
left join ingest.source_links sl on sl.source_record_id = sr.source_record_id
left join public.results r on r.result_id = sl.result_id
left join public.relay_results rr on rr.relay_result_id = sl.relay_result_id
group by d.url_key,d.source_meet_key
order by d.url_key;

-- 8. Athletic.net collision-pair overlap. Equal individual rows are evidence, not a merge command.
with duplicate_meets as (
  select lower(regexp_replace(btrim(athletic_net_results_url), '/+$', '')) as url_key,
         array_agg(meet_id order by meet_id) as meet_ids
  from public.meets
  where athletic_net_results_url is not null and btrim(athletic_net_results_url) <> ''
  group by 1
  having count(*) > 1
), pairs as (
  select url_key,meet_ids[1] as meet_a,meet_ids[2] as meet_b from duplicate_meets
)
select p.url_key,p.meet_a,p.meet_b,
       (select count(*) from public.results r where r.meet_id=p.meet_a) as a_results,
       (select count(*) from public.results r where r.meet_id=p.meet_b) as b_results,
       (select count(*) from public.results ra
        join public.results rb
          on rb.meet_id=p.meet_b
         and rb.athlete_id=ra.athlete_id
         and rb.event_type_id=ra.event_type_id
         and rb.mark_raw is not distinct from ra.mark_raw
         and rb.place is not distinct from ra.place
         and rb.round is not distinct from ra.round
         and rb.team_id is not distinct from ra.team_id
        where ra.meet_id=p.meet_a) as result_overlap,
       (select count(*) from public.relay_results rr where rr.meet_id=p.meet_a) as a_relays,
       (select count(*) from public.relay_results rr where rr.meet_id=p.meet_b) as b_relays,
       (select count(*) from public.relay_results ra
        join public.relay_results rb
          on rb.meet_id=p.meet_b
         and rb.event_type_id=ra.event_type_id
         and rb.mark_raw is not distinct from ra.mark_raw
         and rb.place is not distinct from ra.place
         and rb.round is not distinct from ra.round
         and rb.team_id is not distinct from ra.team_id
        where ra.meet_id=p.meet_a) as relay_overlap
from pairs p
order by p.url_key;

-- 9. Name/date candidates with private source lineage, if any.
select coalesce(r.meet_id, rr.meet_id) as meet_id,
       sr.source,
       count(*) filter (where sl.result_id is not null) as linked_result_rows,
       count(*) filter (where sl.relay_result_id is not null) as linked_relay_rows,
       count(*) as source_link_rows
from ingest.source_links sl
join ingest.source_records sr using (source_record_id)
left join public.results r on r.result_id = sl.result_id
left join public.relay_results rr on rr.relay_result_id = sl.relay_result_id
where coalesce(r.meet_id, rr.meet_id) in (12325,12472,12788,12792)
group by coalesce(r.meet_id, rr.meet_id), sr.source
order by meet_id, sr.source;
