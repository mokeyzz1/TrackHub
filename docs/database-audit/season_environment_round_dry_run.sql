-- Read-only vocabulary profile for the season/environment/round audit.
-- No UPDATE/DELETE/DDL is intentionally present in this file.

-- 1) Meet-season values: only Indoor/Outdoor/XC + four-digit year are deterministic.
select
  season as raw_season,
  count(*)::bigint as meet_count,
  case
    when season ~* '^indoor\s+[0-9]{4}$' then upper(regexp_replace(trim(season), '\s+', '_'))
    when season ~* '^outdoor\s+[0-9]{4}$' then upper(regexp_replace(trim(season), '\s+', '_'))
    when season ~* '^xc\s+[0-9]{4}$' then upper(regexp_replace(trim(season), '\s+', '_'))
    else null
  end as deterministic_code,
  case
    when season ~* '^(indoor|outdoor|xc)\s+[0-9]{4}$' then 'candidate'
    when season ~* '^summer\s+[0-9]{4}$' then 'ambiguous_summer'
    when season is null then 'missing'
    else 'review'
  end as disposition
from public.meets
group by season
order by meet_count desc, raw_season;

-- 2) Result season_code is currently a dead/null surface; do not infer it from year alone.
select count(*)::bigint as results_rows,
       count(*) filter (where season_code is null)::bigint as season_code_null
from public.results;

-- 3) Environment values: retain NULLs until source/meet/event evidence supports a mapping.
select coalesce(environment, '<NULL>') as raw_environment, count(*)::bigint as result_rows
from public.results
group by environment
order by result_rows desc, raw_environment;

-- 4) Round candidates: preserve raw text; only these mappings are deterministic.
select coalesce(round, '<NULL>') as raw_round,
       count(*)::bigint as result_rows,
       case
         when round ~* '^finals?$' then 'final'
         when round ~* '^prelims?(inaries)?$' then 'prelim'
         when round ~* '^semifinals?$' then 'semifinal'
         when round ~* '^heat\s+[0-9]+$' then 'heat'
         when round is null then null
         else null
       end as deterministic_round
from public.results
group by round
order by result_rows desc, raw_round;

