-- Read-only source-ownership candidates for known meet identity collisions.
-- This joins existing private source_links to canonical meet parents; it does not create an alias
-- table and intentionally does not infer ownership for unlinked source records.

with candidate_meets as (
  select
    'tfrrs_url'::text as candidate_type,
    lower(regexp_replace(btrim(tfrrs_url), '/+$', '')) as candidate_key,
    meet_id
  from public.meets
  where tfrrs_url is not null and btrim(tfrrs_url) <> ''
    and lower(regexp_replace(btrim(tfrrs_url), '/+$', '')) in (
      select lower(regexp_replace(btrim(tfrrs_url), '/+$', ''))
      from public.meets
      where tfrrs_url is not null and btrim(tfrrs_url) <> ''
      group by 1 having count(*) > 1
    )
  union all
  select
    'athletic_net_url',
    lower(regexp_replace(btrim(athletic_net_results_url), '/+$', '')),
    meet_id
  from public.meets
  where athletic_net_results_url is not null and btrim(athletic_net_results_url) <> ''
    and lower(regexp_replace(btrim(athletic_net_results_url), '/+$', '')) in (
      select lower(regexp_replace(btrim(athletic_net_results_url), '/+$', ''))
      from public.meets
      where athletic_net_results_url is not null and btrim(athletic_net_results_url) <> ''
      group by 1 having count(*) > 1
    )
  union all
  select
    'name_date',
    lower(regexp_replace(name, '[^a-z0-9]+', '', 'gi')) || '|' || date::text,
    meet_id
  from public.meets
  where (lower(regexp_replace(name, '[^a-z0-9]+', '', 'gi')), date) in (
    select lower(regexp_replace(name, '[^a-z0-9]+', '', 'gi')), date
    from public.meets
    group by 1, 2 having count(*) > 1
  )
), linked_targets as (
  select
    sl.source_record_id,
    sl.link_status,
    coalesce(r.meet_id, rr.meet_id) as meet_id
  from ingest.source_links sl
  left join public.results r on r.result_id = sl.result_id
  left join public.relay_results rr on rr.relay_result_id = sl.relay_result_id
)
select
  cm.candidate_type,
  cm.candidate_key,
  cm.meet_id,
  m.name,
  m.date,
  count(distinct lt.source_record_id)::bigint as linked_source_records,
  count(lt.source_record_id)::bigint as source_link_rows,
  coalesce(string_agg(distinct sr.source, ', ' order by sr.source), '') as linked_sources,
  coalesce(string_agg(distinct lt.link_status, ', ' order by lt.link_status), '') as link_statuses
from candidate_meets cm
join public.meets m using (meet_id)
left join linked_targets lt using (meet_id)
left join ingest.source_records sr using (source_record_id)
group by cm.candidate_type, cm.candidate_key, cm.meet_id, m.name, m.date
order by cm.candidate_type, cm.candidate_key, m.date, cm.meet_id;

-- Source records in the strongest TFRRS candidate that have not yet been promoted to a link.
select
  sr.source_record_id,
  sr.source_event_key,
  sr.source_record_key,
  sl.entity_type,
  sl.link_status
from ingest.source_records sr
left join ingest.source_links sl using (source_record_id)
where sr.source = 'tfrrs' and sr.source_meet_key = '96401'
order by sr.source_event_key, sr.source_record_id;
