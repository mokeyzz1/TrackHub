-- Normalize the legacy public.divisions bucket without breaking current readers.
-- The legacy columns remain compatibility fields. New relationships distinguish:
--   governing organization -> optional division/sector -> school membership.
-- A school may gain additional non-primary memberships without overwriting history.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE public.athletic_governing_organizations (
  organization_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  organization_type text NOT NULL,
  country_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT athletic_governing_organizations_code_ck
    CHECK (code = upper(code) AND btrim(code) <> ''),
  CONSTRAINT athletic_governing_organizations_type_ck
    CHECK (organization_type IN ('association','conference','league','network')),
  CONSTRAINT athletic_governing_organizations_country_ck
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);

CREATE TABLE public.competition_levels (
  competition_level_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL
    REFERENCES public.athletic_governing_organizations(organization_id) ON DELETE RESTRICT,
  code text NOT NULL,
  display_name text NOT NULL,
  level_type text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competition_levels_type_ck
    CHECK (level_type IN ('division','sector','class')),
  CONSTRAINT competition_levels_code_ck CHECK (btrim(code) <> ''),
  CONSTRAINT competition_levels_organization_code_uq UNIQUE (organization_id, code),
  CONSTRAINT competition_levels_organization_id_uq UNIQUE (organization_id, competition_level_id)
);

CREATE TABLE public.school_competition_memberships (
  school_competition_membership_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id bigint NOT NULL REFERENCES public.schools(school_id) ON DELETE RESTRICT,
  organization_id bigint,
  competition_level_id bigint,
  membership_status text NOT NULL,
  valid_from date,
  valid_to date,
  is_primary boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'legacy_mapped',
  evidence_url text,
  legacy_division_id integer REFERENCES public.divisions(division_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_competition_memberships_status_ck
    CHECK (membership_status IN ('active','affiliate','provisional','former','independent','unknown')),
  CONSTRAINT school_competition_memberships_verification_ck
    CHECK (verification_status IN ('source_verified','owner_reviewed','legacy_mapped','unresolved')),
  CONSTRAINT school_competition_memberships_dates_ck
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CONSTRAINT school_competition_memberships_identity_ck
    CHECK (
      (membership_status = 'independent' AND organization_id IS NULL AND competition_level_id IS NULL)
      OR
      (membership_status <> 'independent' AND organization_id IS NOT NULL)
    ),
  CONSTRAINT school_competition_memberships_level_org_fk
    FOREIGN KEY (organization_id, competition_level_id)
    REFERENCES public.competition_levels(organization_id, competition_level_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX school_competition_memberships_current_primary_uq
  ON public.school_competition_memberships(school_id)
  WHERE is_primary AND valid_to IS NULL;
CREATE INDEX school_competition_memberships_organization_idx
  ON public.school_competition_memberships(organization_id);
CREATE INDEX school_competition_memberships_level_idx
  ON public.school_competition_memberships(competition_level_id)
  WHERE competition_level_id IS NOT NULL;
CREATE UNIQUE INDEX school_competition_memberships_school_legacy_uq
  ON public.school_competition_memberships(school_id, legacy_division_id)
  WHERE legacy_division_id IS NOT NULL;

INSERT INTO public.athletic_governing_organizations
  (code, display_name, organization_type, country_code)
VALUES
  ('NCAA', 'National Collegiate Athletic Association', 'association', 'US'),
  ('NAIA', 'National Association of Intercollegiate Athletics', 'association', 'US'),
  ('NJCAA', 'National Junior College Athletic Association', 'association', 'US'),
  ('CCCAA', 'California Community College Athletic Association', 'association', 'US'),
  ('USPORTS', 'U SPORTS', 'association', 'CA'),
  ('USCAA', 'United States Collegiate Athletic Association', 'association', 'US'),
  ('NCCAA', 'National Christian College Athletic Association', 'association', 'US'),
  ('LAI', 'Liga Atletica Interuniversitaria de Puerto Rico', 'league', 'PR'),
  ('NWAC', 'Northwest Athletic Conference', 'conference', 'US'),
  ('NSAC', 'New South Athletic Conference', 'league', 'US'),
  ('CONADEIP', 'Comision Nacional Deportiva Estudiantil de Instituciones Privadas', 'association', 'MX'),
  ('RSEQ', 'Reseau du sport etudiant du Quebec', 'network', 'CA');

INSERT INTO public.competition_levels
  (organization_id, code, display_name, level_type, sort_order)
SELECT organization_id, v.code, v.display_name, v.level_type, v.sort_order
FROM public.athletic_governing_organizations organization
JOIN (VALUES
  ('NCAA','DI','NCAA Division I','division',1),
  ('NCAA','DII','NCAA Division II','division',2),
  ('NCAA','DIII','NCAA Division III','division',3),
  ('NCCAA','I','NCCAA Division I','division',1),
  ('NCCAA','II','NCCAA Division II','division',2),
  ('RSEQ','COLLEGIATE','RSEQ Collegiate Sector','sector',1)
) AS v(organization_code,code,display_name,level_type,sort_order)
  ON organization.code = v.organization_code;

-- Governing-body research supersedes the institution handbook's affiliate
-- wording: NAIA currently lists this institution as a non-countable opponent,
-- not an NAIA member. Preserve the school and athletes; correct classification only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.schools
    WHERE school_id = 2134 AND official_name = 'University of The Bahamas'
      AND institution_type = 'collegiate' AND division = 'NAIA'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.schools
    WHERE school_id = 2134 AND official_name = 'University of The Bahamas'
      AND institution_type = 'collegiate' AND division = 'INDEPENDENT'
  ) THEN
    RAISE EXCEPTION 'University of The Bahamas classification no longer matches reviewed state';
  END IF;

  UPDATE public.schools school
  SET division = 'INDEPENDENT', division_id = division.division_id, updated_at = now()
  FROM public.divisions division
  WHERE school.school_id = 2134 AND division.code = 'INDEPENDENT'
    AND (school.division, school.division_id)
      IS DISTINCT FROM ('INDEPENDENT', division.division_id);
END $$;

WITH mapping (legacy_code, organization_code, level_code, membership_status) AS (
  VALUES
    ('DI','NCAA','DI','active'),
    ('DII','NCAA','DII','active'),
    ('DIII','NCAA','DIII','active'),
    ('NAIA','NAIA',NULL,'active'),
    ('NJCAA','NJCAA',NULL,'active'),
    ('CCCAA','CCCAA',NULL,'active'),
    ('USPORTS','USPORTS',NULL,'active'),
    ('USCAA','USCAA',NULL,'active'),
    ('NCCAA-I','NCCAA','I','active'),
    ('NCCAA-II','NCCAA','II','active'),
    ('LAI','LAI',NULL,'active'),
    ('NWAC','NWAC',NULL,'active'),
    ('NSAC','NSAC',NULL,'active'),
    ('CONADEIP','CONADEIP',NULL,'active'),
    ('RSEQ-COL','RSEQ','COLLEGIATE','active')
)
INSERT INTO public.school_competition_memberships (
  school_id, organization_id, competition_level_id, membership_status,
  is_primary, verification_status, legacy_division_id
)
SELECT school.school_id, organization.organization_id,
       level.competition_level_id, mapping.membership_status,
       true, 'legacy_mapped', legacy.division_id
FROM public.schools school
JOIN public.divisions legacy ON legacy.division_id = school.division_id
JOIN mapping ON mapping.legacy_code = legacy.code
JOIN public.athletic_governing_organizations organization
  ON organization.code = mapping.organization_code
LEFT JOIN public.competition_levels level
  ON level.organization_id = organization.organization_id
 AND level.code = mapping.level_code
WHERE school.institution_type = 'collegiate'
  AND NOT EXISTS (
    SELECT 1 FROM public.school_competition_memberships existing
    WHERE existing.school_id = school.school_id
      AND existing.legacy_division_id = legacy.division_id
  );

INSERT INTO public.school_competition_memberships (
  school_id, membership_status, is_primary, verification_status,
  evidence_url, legacy_division_id
)
SELECT school.school_id, 'independent', true,
       CASE WHEN school.school_id = 2134 THEN 'source_verified' ELSE 'legacy_mapped' END,
       CASE WHEN school.school_id = 2134
         THEN 'https://www.naia.org/membership/national-administrative-council-nac/' END,
       division.division_id
FROM public.schools school
JOIN public.divisions division ON division.division_id = school.division_id
WHERE school.institution_type = 'collegiate' AND division.code = 'INDEPENDENT'
  AND NOT EXISTS (
    SELECT 1 FROM public.school_competition_memberships existing
    WHERE existing.school_id = school.school_id
      AND existing.legacy_division_id = division.division_id
  );

DO $$
DECLARE classified_schools integer;
DECLARE membership_rows integer;
BEGIN
  SELECT count(*) INTO classified_schools
  FROM public.schools
  WHERE institution_type = 'collegiate' AND division_id IS NOT NULL;

  SELECT count(*) INTO membership_rows
  FROM public.school_competition_memberships
  WHERE is_primary AND valid_to IS NULL;

  IF membership_rows <> classified_schools THEN
    RAISE EXCEPTION 'primary membership coverage mismatch: % memberships for % classified schools',
      membership_rows, classified_schools;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.school_competition_memberships membership
    LEFT JOIN public.competition_levels level
      ON level.competition_level_id = membership.competition_level_id
    WHERE membership.competition_level_id IS NOT NULL
      AND level.organization_id <> membership.organization_id
  ) THEN
    RAISE EXCEPTION 'competition level belongs to the wrong governing organization';
  END IF;
END $$;

CREATE VIEW public.school_competition_profiles
WITH (security_invoker = true)
AS
SELECT
  school.school_id,
  school.official_name,
  school.institution_type,
  membership.membership_status,
  organization.code AS organization_code,
  organization.display_name AS organization_name,
  organization.organization_type,
  level.code AS competition_level_code,
  level.display_name AS competition_level_name,
  level.level_type,
  membership.verification_status,
  membership.valid_from,
  membership.valid_to
FROM public.schools school
LEFT JOIN public.school_competition_memberships membership
  ON membership.school_id = school.school_id
 AND membership.is_primary
 AND membership.valid_to IS NULL
LEFT JOIN public.athletic_governing_organizations organization
  ON organization.organization_id = membership.organization_id
LEFT JOIN public.competition_levels level
  ON level.competition_level_id = membership.competition_level_id;

ALTER TABLE public.athletic_governing_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_competition_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY athletic_governing_organizations_public_read
  ON public.athletic_governing_organizations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY competition_levels_public_read
  ON public.competition_levels FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY school_competition_memberships_public_read
  ON public.school_competition_memberships FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON public.athletic_governing_organizations FROM PUBLIC;
REVOKE ALL ON public.competition_levels FROM PUBLIC;
REVOKE ALL ON public.school_competition_memberships FROM PUBLIC;
REVOKE ALL ON public.school_competition_profiles FROM PUBLIC;
GRANT SELECT ON public.athletic_governing_organizations TO anon, authenticated;
GRANT SELECT ON public.competition_levels TO anon, authenticated;
GRANT SELECT ON public.school_competition_memberships TO anon, authenticated;
GRANT SELECT ON public.school_competition_profiles TO anon, authenticated;
GRANT ALL ON public.athletic_governing_organizations TO service_role;
GRANT ALL ON public.competition_levels TO service_role;
GRANT ALL ON public.school_competition_memberships TO service_role;
GRANT SELECT ON public.school_competition_profiles TO service_role;

COMMENT ON TABLE public.athletic_governing_organizations IS
  'Canonical collegiate governing organizations; does not contain NCAA divisions or school career status.';
COMMENT ON TABLE public.competition_levels IS
  'Divisions, sectors, or classes that are meaningful only within one governing organization.';
COMMENT ON TABLE public.school_competition_memberships IS
  'Time-aware school membership in governing organizations; supports dual affiliations without overwriting history.';
COMMENT ON VIEW public.school_competition_profiles IS
  'Current primary school competition classification, normalized into organization and optional level.';

COMMIT;
