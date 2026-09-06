#!/usr/bin/env node
// Generates the reviewed additive catalog migration from the validated manifest and TFRRS review.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const manifest=require('./collegiate_school_onboarding_20260906.json');
const review=require(process.argv[2]||'./collegiate_source_team_review_20260906.json');
const destination=process.argv[3];
if(!destination)throw new Error('Supply the migration destination path');
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const schoolKey=url=>url.replace(/_(m|f)_/i,'_X_').replace(/_(m|f)\.html$/i,'_X.html');
const bySource=new Map(manifest.map(row=>[row.source_name,row]));
const groups=new Map();
for(const source of review.association_confirmed){
  const key=schoolKey(source.source_url);
  const group=groups.get(key)||{source_name:source.source_team,source_urls:[],athletes:new Set()};
  assert.equal(group.source_name,source.source_team);
  group.source_urls.push(source.source_url);
  for(const athlete of source.athletes)group.athletes.add(String(athlete.athlete_id));
  groups.set(key,group);
}
assert.equal(groups.size,manifest.length);
assert.deepEqual([...groups.values()].map(x=>x.source_name).sort(),manifest.map(x=>x.source_name).sort());

const schoolRows=manifest.map(row=>`    (${[row.official_name,row.short_name,row.city,row.state,row.division_code].map(quote).join(', ')})`).join(',\n');
const teamRows=review.association_confirmed
  .map(source=>{
    const school=bySource.get(source.source_team);assert(school);
    const match=source.source_url.match(/_([mf])_(.+?)\.html$/i);assert(match);
    return {official_name:school.official_name,source_name:source.source_team,gender:match[1].toUpperCase(),source_key:match[2],source_url:source.source_url};
  })
  .sort((a,b)=>a.official_name.localeCompare(b.official_name)||a.gender.localeCompare(b.gender))
  .map(row=>`    (${[row.official_name,row.source_name,row.gender,row.source_key,row.source_url].map(quote).join(', ')})`).join(',\n');

const sql=`-- Add the confirmed collegiate institutions absent from the canonical catalog.
-- This is reference-catalog onboarding only: no athlete, result, relay, or meet fact is changed.
-- Exact TFRRS gender URLs and source keys are retained so future ingestion resolves deterministically.
-- NWAC is its own collegiate association and must not be mislabeled as NJCAA.
-- Source review: TFRRS team pages; official NWAC member list; NCAA directory; NJCAA directory;
-- current NCCAA member pages; Madera Community College's official catalog.

INSERT INTO public.divisions (code, display_name, governing_body, sort_order, classification_kind)
SELECT 'NWAC', 'Northwest Athletic Conference', 'NWAC',
       COALESCE((SELECT max(sort_order) + 1 FROM public.divisions), 1), 'association'
WHERE NOT EXISTS (SELECT 1 FROM public.divisions WHERE code = 'NWAC');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.divisions
    WHERE code = 'NWAC'
      AND (display_name <> 'Northwest Athletic Conference'
           OR governing_body <> 'NWAC'
           OR classification_kind <> 'association')
  ) THEN
    RAISE EXCEPTION 'Existing NWAC division row has conflicting semantics';
  END IF;
END $$;

WITH desired (official_name, short_name, city, state, division_code) AS (
  VALUES
${schoolRows}
)
INSERT INTO public.schools (
  official_name, short_name, city, state, division, division_id, institution_type, is_active
)
SELECT d.official_name, d.short_name, d.city, d.state, d.division_code,
       v.division_id, 'collegiate', true
FROM desired d
JOIN public.divisions v ON v.code = d.division_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.schools s WHERE lower(s.official_name) = lower(d.official_name)
);

DO $$
DECLARE missing_count integer;
BEGIN
  WITH desired (official_name, short_name, city, state, division_code) AS (
    VALUES
${schoolRows}
  )
  SELECT count(*) INTO missing_count
  FROM desired d
  LEFT JOIN public.schools s ON lower(s.official_name) = lower(d.official_name)
  LEFT JOIN public.divisions v ON v.code = d.division_code
  WHERE s.school_id IS NULL
     OR v.division_id IS NULL
     OR s.division_id IS DISTINCT FROM v.division_id
     OR s.division IS DISTINCT FROM d.division_code
     OR s.institution_type IS DISTINCT FROM 'collegiate'
     OR s.state IS DISTINCT FROM d.state;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION '% desired collegiate schools are missing or conflict with reviewed identity', missing_count;
  END IF;
END $$;

WITH desired (official_name, source_name, gender, source_key, source_url) AS (
  VALUES
${teamRows}
)
INSERT INTO public.teams (
  school_id, gender, team_name, team_type, tfrrs_team_url, is_active
)
SELECT s.school_id, d.gender, d.source_name, 'collegiate', d.source_url, true
FROM desired d
JOIN public.schools s ON lower(s.official_name) = lower(d.official_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.teams t
  WHERE t.school_id = s.school_id AND t.gender = d.gender
);

DO $$
DECLARE conflict_count integer;
BEGIN
  WITH desired (official_name, source_name, gender, source_key, source_url) AS (
    VALUES
${teamRows}
  )
  SELECT count(*) INTO conflict_count
  FROM desired d
  JOIN public.schools s ON lower(s.official_name) = lower(d.official_name)
  LEFT JOIN public.teams t ON t.school_id = s.school_id AND t.gender = d.gender
  WHERE t.team_id IS NULL
     OR t.tfrrs_team_url IS DISTINCT FROM d.source_url
     OR EXISTS (
       SELECT 1 FROM public.teams other
       WHERE other.tfrrs_team_url = d.source_url AND other.team_id <> t.team_id
     );
  IF conflict_count <> 0 THEN
    RAISE EXCEPTION '% desired collegiate teams are missing or conflict with reviewed source URLs', conflict_count;
  END IF;
END $$;

-- Correct the four pre-existing aliases that were reviewed against the wrong similarly named
-- institutions. The predicates name both the old and new identities, so an unexpected target
-- remains blocked by the general conflict assertion below.
WITH corrections (normalized_key, gender, old_official_name, old_state, old_url, new_official_name) AS (
  VALUES
    ('clark college', 'M', 'Clark', 'MA', 'https://www.tfrrs.org/teams/tf/MA_college_m_Clark.html', 'Clark College'),
    ('clark college', 'F', 'Clark', 'MA', 'https://www.tfrrs.org/teams/tf/MA_college_f_Clark.html', 'Clark College'),
    ('lane cc', 'M', 'Lane', 'TN', 'https://www.tfrrs.org/teams/tf/TN_college_m_Lane.html', 'Lane Community College'),
    ('lane cc', 'F', 'Lane', 'TN', 'https://www.tfrrs.org/teams/tf/TN_college_f_Lane.html', 'Lane Community College')
)
UPDATE ingest.team_aliases a
SET team_id = new_team.team_id,
    notes = 'Corrected reviewed source identity; prior alias targeted a different similarly named institution.',
    verified_at = now(),
    updated_at = now()
FROM corrections c
JOIN public.teams old_team ON old_team.tfrrs_team_url = c.old_url
JOIN public.schools old_school
  ON old_school.school_id = old_team.school_id
 AND old_school.official_name = c.old_official_name
 AND old_school.state = c.old_state
JOIN public.schools new_school ON new_school.official_name = c.new_official_name
JOIN public.teams new_team
  ON new_team.school_id = new_school.school_id
 AND new_team.gender = c.gender
WHERE a.source = 'tfrrs'
  AND a.normalized_source_team_key = c.normalized_key
  AND a.source_gender = c.gender
  AND a.team_id = old_team.team_id;

DO $$
DECLARE conflict_count integer;
BEGIN
  WITH desired (official_name, source_name, gender, source_key, source_url) AS (
    VALUES
${teamRows}
  ), resolved AS (
    SELECT d.*, t.team_id
    FROM desired d
    JOIN public.schools s ON lower(s.official_name) = lower(d.official_name)
    JOIN public.teams t ON t.school_id = s.school_id AND t.gender = d.gender
  )
  SELECT count(*) INTO conflict_count
  FROM resolved r
  JOIN ingest.team_aliases a
    ON a.source = 'tfrrs'
   AND a.normalized_source_team_key = lower(trim(regexp_replace(r.source_key, '[^a-zA-Z0-9]+', ' ', 'g')))
   AND a.source_gender = r.gender
  WHERE a.team_id <> r.team_id;
  IF conflict_count <> 0 THEN
    RAISE EXCEPTION '% conflicting reviewed TFRRS team aliases exist', conflict_count;
  END IF;
END $$;

WITH desired (official_name, source_name, gender, source_key, source_url) AS (
  VALUES
${teamRows}
)
INSERT INTO ingest.team_aliases (
  source, source_team_key, source_team_name, source_gender,
  normalized_source_team_key, normalized_source_team_name,
  team_id, match_method, notes
)
SELECT 'tfrrs', d.source_key, d.source_name, d.gender,
       lower(trim(regexp_replace(d.source_key, '[^a-zA-Z0-9]+', ' ', 'g'))),
       lower(trim(regexp_replace(d.source_name, '[^a-zA-Z0-9]+', ' ', 'g'))),
       t.team_id, 'verified_alias',
       'Association-confirmed collegiate source identity; reviewed 2026-09-06.'
FROM desired d
JOIN public.schools s ON lower(s.official_name) = lower(d.official_name)
JOIN public.teams t ON t.school_id = s.school_id AND t.gender = d.gender
ON CONFLICT (source, normalized_source_team_key, source_gender) DO UPDATE
SET source_team_key = EXCLUDED.source_team_key,
    source_team_name = EXCLUDED.source_team_name,
    normalized_source_team_name = EXCLUDED.normalized_source_team_name,
    team_id = EXCLUDED.team_id,
    status = 'active',
    match_method = EXCLUDED.match_method,
    notes = EXCLUDED.notes,
    verified_at = now(),
    updated_at = now();

COMMENT ON TABLE public.divisions IS
  'Canonical competition classifications. classification_kind distinguishes divisions, associations, and leagues.';
`;
fs.writeFileSync(path.resolve(destination),sql);
console.log(JSON.stringify({destination:path.resolve(destination),schools:manifest.length,teams:review.association_confirmed.length},null,2));
