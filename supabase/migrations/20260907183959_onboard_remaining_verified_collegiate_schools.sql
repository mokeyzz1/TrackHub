-- Onboard the remaining source-verified collegiate cohort. This migration is
-- limited to classifications, schools, teams, and deterministic source aliases.
-- Athlete/result facts are repaired separately with exact before-images.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- "Independent" is a real classification state, not a governing association.
ALTER TABLE public.divisions DROP CONSTRAINT IF EXISTS divisions_classification_kind_check;
ALTER TABLE public.divisions
  ADD CONSTRAINT divisions_classification_kind_check
  CHECK (classification_kind IN ('division', 'association', 'league', 'independent', 'unknown'));

INSERT INTO public.divisions (code, display_name, governing_body, sort_order, classification_kind)
VALUES
  ('INDEPENDENT', 'Independent collegiate program', 'Independent', 32, 'independent'),
  ('NSAC', 'New South Athletic Conference', 'NSAC', 33, 'league'),
  ('CONADEIP', 'Comision Nacional Deportiva Estudiantil de Instituciones Privadas', 'CONADEIP', 34, 'association'),
  ('RSEQ-COL', 'RSEQ Collegiate', 'RSEQ', 35, 'association')
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.divisions
    WHERE (code = 'INDEPENDENT' AND classification_kind <> 'independent')
       OR (code = 'NSAC' AND classification_kind <> 'league')
       OR (code IN ('CONADEIP', 'RSEQ-COL') AND classification_kind <> 'association')
  ) OR (SELECT count(*) FROM public.divisions WHERE code IN ('INDEPENDENT','NSAC','CONADEIP','RSEQ-COL')) <> 4 THEN
    RAISE EXCEPTION 'remaining collegiate classification semantics conflict';
  END IF;
END $$;

-- UQAM already exists, but its legacy NJCAA assignment is demonstrably wrong.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.schools
    WHERE school_id = 1610
      AND official_name = 'Citadins de l''UQAM'
      AND institution_type = 'collegiate'
      AND division = 'NJCAA'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.schools
    WHERE school_id = 1610
      AND official_name = 'Citadins de l''UQAM'
      AND institution_type = 'collegiate'
      AND division = 'USPORTS'
  ) THEN
    RAISE EXCEPTION 'UQAM row is missing or has an unexpected classification';
  END IF;

  UPDATE public.schools s
  SET division = 'USPORTS', division_id = d.division_id, updated_at = now()
  FROM public.divisions d
  WHERE s.school_id = 1610 AND d.code = 'USPORTS'
    AND (s.division, s.division_id) IS DISTINCT FROM ('USPORTS', d.division_id);
END $$;

WITH desired (official_name, short_name, city, state, division_code) AS (
  VALUES
    ('McGill University', 'McGill', 'Montreal', 'QC', 'USPORTS'),
    ('University of Manitoba', 'Manitoba', 'Winnipeg', 'MB', 'USPORTS'),
    ('Nevada State University', 'Nevada State', 'Henderson', 'NV', 'INDEPENDENT'),
    ('McMaster University', 'McMaster', 'Hamilton', 'ON', 'USPORTS'),
    ('South Carolina Central Christian College', 'SC Central Christian', 'Columbia', 'SC', 'NSAC'),
    ('University of The Bahamas', 'Bahamas', 'Nassau', 'The Bahamas', 'NAIA'),
    ('Tecnologico de Monterrey - Ciudad de Mexico', 'Tecnologico de Monterrey CCM', 'Mexico City', 'CDMX', 'CONADEIP'),
    ('Porterville College', 'Porterville', 'Porterville', 'CA', 'CCCAA'),
    ('Cerro Coso Community College', 'Cerro Coso', 'Ridgecrest', 'CA', 'CCCAA'),
    ('Cegep de Trois-Rivieres', 'Cegep de Trois-Rivieres', 'Trois-Rivieres', 'QC', 'RSEQ-COL'),
    ('Albizu University - Miami', 'Albizu Miami', 'Miami', 'FL', 'INDEPENDENT')
)
INSERT INTO public.schools (
  official_name, short_name, city, state, division, division_id,
  institution_type, is_active
)
SELECT d.official_name, d.short_name, d.city, d.state, d.division_code,
       division.division_id, 'collegiate', true
FROM desired d
JOIN public.divisions division ON division.code = d.division_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.schools s
  WHERE lower(s.official_name) = lower(d.official_name)
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.schools WHERE lower(official_name) IN (
    lower('McGill University'), lower('University of Manitoba'), lower('Nevada State University'),
    lower('McMaster University'), lower('South Carolina Central Christian College'),
    lower('University of The Bahamas'), lower('Tecnologico de Monterrey - Ciudad de Mexico'),
    lower('Porterville College'), lower('Cerro Coso Community College'),
    lower('Cegep de Trois-Rivieres'), lower('Albizu University - Miami')
  )) <> 11 THEN
    RAISE EXCEPTION 'expected exactly 11 newly onboarded canonical school identities';
  END IF;
END $$;

WITH desired (official_name, source_name, gender, source_key, source_url) AS (
  VALUES
    ('McGill University','MCGILL','F','McGill_QC','https://www.tfrrs.org/teams/tf/QC_college_f_McGill_QC.html'),
    ('McGill University','MCGILL','M','McGill_QC','https://www.tfrrs.org/teams/tf/QC_college_m_McGill_QC.html'),
    ('University of Manitoba','U OF MANITOBA','M','U_of_Manitoba','https://www.tfrrs.org/teams/tf/MB_college_m_U_of_Manitoba.html'),
    ('University of Manitoba','U OF MANITOBA','F','U_of_Manitoba','https://www.tfrrs.org/teams/tf/MB_college_f_U_of_Manitoba.html'),
    ('Nevada State University','NEVADA_STATE_UNIVERSITY','M','Nevada_State_University','https://www.tfrrs.org/teams/tf/NV_college_m_Nevada_State_University.html'),
    ('McMaster University','MCMASTER','M','McMaster','https://www.tfrrs.org/teams/tf/ON_college_m_McMaster.html'),
    ('McMaster University','MCMASTER','F','McMaster','https://www.tfrrs.org/teams/tf/ON_college_f_McMaster.html'),
    ('South Carolina Central Christian College','SC CENTRAL CHRISTIAN COLLEGE','M','SC_Central_Christian_College','https://www.tfrrs.org/teams/tf/SC_college_m_SC_Central_Christian_College.html'),
    ('South Carolina Central Christian College','SC CENTRAL CHRISTIAN COLLEGE','F','SC_Central_Christian_College','https://www.tfrrs.org/teams/tf/SC_college_f_SC_Central_Christian_College.html'),
    ('University of The Bahamas','UNIVERSITY OF THE BAHAMAS','F','University_of_The_Bahamas','https://www.tfrrs.org/teams/tf/FL_college_f_University_of_The_Bahamas.html'),
    ('University of The Bahamas','UNIVERSITY OF THE BAHAMAS','M','University_of_The_Bahamas','https://www.tfrrs.org/teams/tf/FL_college_m_University_of_The_Bahamas.html'),
    ('Tecnologico de Monterrey - Ciudad de Mexico','TECNOLOGICO DE MONTERREY CCM','M','TECNOLOGICO_DE_MONTERREY_CCM','https://www.tfrrs.org/teams/tf/CA_college_m_TECNOLOGICO_DE_MONTERREY_CCM.html'),
    ('Tecnologico de Monterrey - Ciudad de Mexico','TECNOLOGICO DE MONTERREY CCM','F','TECNOLOGICO_DE_MONTERREY_CCM','https://www.tfrrs.org/teams/tf/CA_college_f_TECNOLOGICO_DE_MONTERREY_CCM.html'),
    ('Community Christian College','C.C.C TEXAS SPARTANS','M','C.C.C TEXAS SPARTANS','https://www.tfrrs.org/teams/tf/TX_jcollege_m_.html'),
    ('Porterville College','PORTERVILLE','M','Porterville','https://www.tfrrs.org/teams/tf/CA_jcollege_m_Porterville.html'),
    ('Cerro Coso Community College','CERRO COSO','M','Cerro_Coso','https://www.tfrrs.org/teams/tf/CA_jcollege_m_Cerro_Coso.html'),
    ('Cegep de Trois-Rivieres','CEGEP DE TROIS-RIVIERES','M','CEGEP DE TROIS-RIVIERES','https://www.tfrrs.org/teams/tf/QC_college_m_.html'),
    ('Albizu University - Miami','ALBIZU UNIVERISITY-MIAMI','M','ALBIZU UNIVERISITY-MIAMI','https://www.tfrrs.org/teams/tf/FL_college_m_.html'),
    ('Citadins de l''UQAM','UQAM','M','UQAM','https://www.tfrrs.org/teams/tf/QC_college_m_UQAM.html')
)
INSERT INTO public.teams (school_id, gender, tfrrs_team_url, team_name, team_type, is_active)
SELECT s.school_id, d.gender, d.source_url, d.source_name, 'collegiate', true
FROM desired d
JOIN public.schools s ON lower(s.official_name) = lower(d.official_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.teams t WHERE t.school_id = s.school_id AND t.gender = d.gender
);

-- Reuse the existing UQAM and Community Christian teams; neither had a source URL.
WITH desired (school_id, gender, source_name, source_url) AS (
  VALUES
    (1610::bigint,'M','UQAM','https://www.tfrrs.org/teams/tf/QC_college_m_UQAM.html'),
    (1656::bigint,'M','C.C.C TEXAS SPARTANS','https://www.tfrrs.org/teams/tf/TX_jcollege_m_.html')
)
UPDATE public.teams t
SET tfrrs_team_url = d.source_url, team_name = d.source_name,
    team_type = 'collegiate', updated_at = now()
FROM desired d
WHERE t.school_id = d.school_id AND t.gender = d.gender
  AND (t.tfrrs_team_url IS NULL OR t.tfrrs_team_url = d.source_url);

-- Penn State Ability Athletics is an alternate source identity for Penn State's
-- existing women's team, so it belongs in the alias layer rather than replacing
-- the primary Penn State team URL.
WITH desired (official_name, source_name, gender, source_key, source_url) AS (
  VALUES
    ('McGill University','MCGILL','F','McGill_QC','https://www.tfrrs.org/teams/tf/QC_college_f_McGill_QC.html'),
    ('McGill University','MCGILL','M','McGill_QC','https://www.tfrrs.org/teams/tf/QC_college_m_McGill_QC.html'),
    ('University of Manitoba','U OF MANITOBA','M','U_of_Manitoba','https://www.tfrrs.org/teams/tf/MB_college_m_U_of_Manitoba.html'),
    ('University of Manitoba','U OF MANITOBA','F','U_of_Manitoba','https://www.tfrrs.org/teams/tf/MB_college_f_U_of_Manitoba.html'),
    ('Nevada State University','NEVADA_STATE_UNIVERSITY','M','Nevada_State_University','https://www.tfrrs.org/teams/tf/NV_college_m_Nevada_State_University.html'),
    ('McMaster University','MCMASTER','M','McMaster','https://www.tfrrs.org/teams/tf/ON_college_m_McMaster.html'),
    ('McMaster University','MCMASTER','F','McMaster','https://www.tfrrs.org/teams/tf/ON_college_f_McMaster.html'),
    ('South Carolina Central Christian College','SC CENTRAL CHRISTIAN COLLEGE','M','SC_Central_Christian_College','https://www.tfrrs.org/teams/tf/SC_college_m_SC_Central_Christian_College.html'),
    ('South Carolina Central Christian College','SC CENTRAL CHRISTIAN COLLEGE','F','SC_Central_Christian_College','https://www.tfrrs.org/teams/tf/SC_college_f_SC_Central_Christian_College.html'),
    ('University of The Bahamas','UNIVERSITY OF THE BAHAMAS','F','University_of_The_Bahamas','https://www.tfrrs.org/teams/tf/FL_college_f_University_of_The_Bahamas.html'),
    ('University of The Bahamas','UNIVERSITY OF THE BAHAMAS','M','University_of_The_Bahamas','https://www.tfrrs.org/teams/tf/FL_college_m_University_of_The_Bahamas.html'),
    ('Tecnologico de Monterrey - Ciudad de Mexico','TECNOLOGICO DE MONTERREY CCM','M','TECNOLOGICO_DE_MONTERREY_CCM','https://www.tfrrs.org/teams/tf/CA_college_m_TECNOLOGICO_DE_MONTERREY_CCM.html'),
    ('Tecnologico de Monterrey - Ciudad de Mexico','TECNOLOGICO DE MONTERREY CCM','F','TECNOLOGICO_DE_MONTERREY_CCM','https://www.tfrrs.org/teams/tf/CA_college_f_TECNOLOGICO_DE_MONTERREY_CCM.html'),
    ('Community Christian College','C.C.C TEXAS SPARTANS','M','C.C.C TEXAS SPARTANS','https://www.tfrrs.org/teams/tf/TX_jcollege_m_.html'),
    ('Porterville College','PORTERVILLE','M','Porterville','https://www.tfrrs.org/teams/tf/CA_jcollege_m_Porterville.html'),
    ('Cerro Coso Community College','CERRO COSO','M','Cerro_Coso','https://www.tfrrs.org/teams/tf/CA_jcollege_m_Cerro_Coso.html'),
    ('Cegep de Trois-Rivieres','CEGEP DE TROIS-RIVIERES','M','CEGEP DE TROIS-RIVIERES','https://www.tfrrs.org/teams/tf/QC_college_m_.html'),
    ('Albizu University - Miami','ALBIZU UNIVERISITY-MIAMI','M','ALBIZU UNIVERISITY-MIAMI','https://www.tfrrs.org/teams/tf/FL_college_m_.html'),
    ('Citadins de l''UQAM','UQAM','M','UQAM','https://www.tfrrs.org/teams/tf/QC_college_m_UQAM.html'),
    ('Penn State','PENN STATE-ABILITY ATHLETICS','F','Penn_State-Ability_Athletics','https://www.tfrrs.org/teams/tf/PA_college_f_Penn_State-Ability_Athletics.html')
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
       'Source-verified collegiate identity; reviewed 2026-09-07.'
FROM desired d
JOIN public.schools s ON lower(s.official_name) = lower(d.official_name)
JOIN public.teams t ON t.school_id = s.school_id AND t.gender = d.gender
ON CONFLICT (source, normalized_source_team_key, source_gender) DO UPDATE
SET source_team_key = EXCLUDED.source_team_key,
    source_team_name = EXCLUDED.source_team_name,
    normalized_source_team_name = EXCLUDED.normalized_source_team_name,
    team_id = EXCLUDED.team_id,
    status = 'active', match_method = EXCLUDED.match_method,
    notes = EXCLUDED.notes, verified_at = now(), updated_at = now();

DO $$
BEGIN
  IF (SELECT count(*) FROM ingest.team_aliases
      WHERE source = 'tfrrs' AND status = 'active'
        AND notes = 'Source-verified collegiate identity; reviewed 2026-09-07.') <> 20 THEN
    RAISE EXCEPTION 'expected all 20 reviewed TFRRS identities to resolve';
  END IF;
END $$;

COMMENT ON COLUMN public.divisions.classification_kind IS
  'Meaning of the competition classification: division, association, league, independent, or unknown.';

COMMIT;
