-- Read-only production scan for the reference/taxonomy layer.
-- Run through the Supabase SQL connector with the project selected.
-- No statement in this file writes rows, changes DDL, or changes access policy.

-- 1. Reference table cardinalities.
select 'divisions' as table_name, count(*) as row_count from public.divisions
union all select 'regions', count(*) from public.regions
union all select 'conferences', count(*) from public.conferences
union all select 'conference_memberships', count(*) from public.conference_memberships
union all select 'external_ids', count(*) from public.external_ids
order by table_name;

-- 2. Division coverage by canonical school/conference/region foreign keys.
select
  d.division_id,
  d.code,
  d.display_name,
  count(distinct s.school_id) as schools,
  count(distinct c.conference_id) as conferences,
  count(distinct r.region_id) as regions
from public.divisions d
left join public.schools s on s.division_id = d.division_id
left join public.conferences c on c.division_id = d.division_id
left join public.regions r on r.division_id = d.division_id
group by d.division_id, d.code, d.display_name
order by d.sort_order, d.division_id;

-- 3. Canonical school reference coverage and legacy-column drift.
select
  count(*) as schools,
  count(*) filter (where current_conference_id is null) as missing_current_conference,
  count(*) filter (where region_id is null) as missing_region,
  count(*) filter (where division_id is null) as missing_division,
  count(*) filter (where division is null) as missing_legacy_division,
  count(*) filter (where ncaa_region is null) as missing_legacy_region,
  count(*) filter (where division is not null and division_id is not null
                   and division <> (select code from public.divisions where divisions.division_id = schools.division_id)
                  ) as legacy_division_mismatch,
  count(*) filter (where division = 'Other') as legacy_other_rows
from public.schools;

-- 4. Orphan checks for all reference foreign keys.
select 'schools.current_conference_id' as relationship, count(*) as orphan_rows
from public.schools s left join public.conferences c on c.conference_id = s.current_conference_id
where s.current_conference_id is not null and c.conference_id is null
union all
select 'schools.region_id', count(*)
from public.schools s left join public.regions r on r.region_id = s.region_id
where s.region_id is not null and r.region_id is null
union all
select 'schools.division_id', count(*)
from public.schools s left join public.divisions d on d.division_id = s.division_id
where s.division_id is not null and d.division_id is null
union all
select 'conferences.division_id', count(*)
from public.conferences c left join public.divisions d on d.division_id = c.division_id
where c.division_id is not null and d.division_id is null
union all
select 'regions.division_id', count(*)
from public.regions r left join public.divisions d on d.division_id = r.division_id
where r.division_id is not null and d.division_id is null
union all
select 'conference_memberships.school_id', count(*)
from public.conference_memberships cm left join public.schools s on s.school_id = cm.school_id
where s.school_id is null
union all
select 'conference_memberships.conference_id', count(*)
from public.conference_memberships cm left join public.conferences c on c.conference_id = cm.conference_id
where c.conference_id is null
order by relationship;

-- 5. Conference coverage and intentionally empty reference rows.
select
  count(*) as conferences,
  count(*) filter (where abbreviation is null or btrim(abbreviation) = '') as missing_abbreviation,
  count(*) filter (where website is null or btrim(website) = '') as missing_website,
  count(*) filter (where division_id is null) as missing_division_id,
  count(*) filter (where division is null) as missing_legacy_division,
  count(*) filter (where region is null) as missing_legacy_region
from public.conferences;

select c.conference_id, c.name, c.division_id
from public.conferences c
left join public.schools s on s.current_conference_id = c.conference_id
group by c.conference_id, c.name, c.division_id
having count(s.school_id) = 0
order by c.conference_id;

-- 6. The historical bridge is currently an empty, constrained surface.
select count(*) as membership_rows,
       count(*) filter (where start_year is null) as missing_start_year,
       count(*) filter (where end_year is null) as missing_end_year
from public.conference_memberships;

-- 7. External identity map shape and uniqueness.
select
  count(*) as rows,
  count(*) filter (where verified) as verified_rows,
  count(distinct athlete_id) filter (where athlete_id is not null) as athletes,
  count(*) filter (where school_id is not null) as school_links,
  count(*) filter (where team_id is not null) as team_links,
  count(*) filter (where conference_id is not null) as conference_links,
  count(*) filter (where external_name is null or btrim(external_name) = '') as missing_external_name,
  count(*) filter (where external_url is null or btrim(external_url) = '') as missing_external_url
from public.external_ids;

select source, external_key, count(*) as duplicate_rows
from public.external_ids
group by source, external_key
having count(*) > 1
order by source, external_key;

-- 8. Athletes with multiple verified source IDs are review candidates, not auto-merges.
select athlete_id, count(*) as rows,
       array_agg(source || ':' || external_key order by source, external_key) as source_keys
from public.external_ids
where athlete_id is not null
group by athlete_id
having count(*) > 1
order by athlete_id;

-- 9. Public policy/access boundary for the reference layer.
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('divisions','regions','conferences','conference_memberships','external_ids')
order by tablename, policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('divisions','regions','conferences','conference_memberships','external_ids')
  and grantee in ('anon','authenticated','service_role','postgres')
order by table_name, grantee, privilege_type;
