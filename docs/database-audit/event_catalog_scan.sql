-- Read-only event catalog/alias audit.
-- Run against production with a read-only role. This file intentionally contains no writes.

select count(*)::bigint as event_types,
       count(*) filter (where category is null or btrim(category)='')::bigint as null_category,
       count(*) filter (where measure is null or btrim(measure)='')::bigint as null_measure,
       count(*) filter (where environment_scope is null or btrim(environment_scope)='')::bigint as null_environment_scope
from public.event_types;

select count(*)::bigint as aliases,
       count(distinct lower(btrim(raw_name)))::bigint as normalized_names,
       count(distinct event_type_id)::bigint as mapped_event_types,
       count(*) filter (where raw_name is null or btrim(raw_name)='')::bigint as blank_raw_names
from public.event_aliases;

select lower(btrim(raw_name)) as raw_key,
       count(*)::bigint as rows,
       array_agg(event_type_id order by event_type_id) as event_type_ids,
       array_agg(raw_name order by event_type_id) as raw_names
from public.event_aliases
group by 1 having count(*)>1
order by rows desc,raw_key;

with r as (select event_type_id,count(*)::bigint as rows from public.results group by event_type_id),
     rr as (select event_type_id,count(*)::bigint as rows from public.relay_results group by event_type_id),
     a as (select event_type_id,count(*)::bigint as rows from public.event_aliases group by event_type_id)
select et.event_type_id,et.code,et.category,et.measure,et.environment_scope,
       coalesce(r.rows,0)::bigint as result_rows,
       coalesce(rr.rows,0)::bigint as relay_rows,
       coalesce(a.rows,0)::bigint as alias_rows
from public.event_types et
left join r using(event_type_id)
left join rr using(event_type_id)
left join a using(event_type_id)
order by result_rows desc,relay_rows desc,et.event_type_id;

select count(*)::bigint as aliases_without_event_type
from public.event_aliases ea
left join public.event_types et on et.event_type_id=ea.event_type_id
where et.event_type_id is null;
