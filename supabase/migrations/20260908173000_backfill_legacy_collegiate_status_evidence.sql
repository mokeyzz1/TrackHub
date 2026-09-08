-- Preserve legacy collegiate team-season relationships as private unresolved evidence.
-- These rows do not contain original roster snapshots, so they must never be promoted as
-- source-verified or used to infer current eligibility/professional status.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.athlete_status_evidence
  DROP CONSTRAINT athlete_status_evidence_type_ck;
ALTER TABLE public.athlete_status_evidence
  ADD CONSTRAINT athlete_status_evidence_type_ck CHECK (
    evidence_type IN ('roster','individual_result','relay_result','source_profile',
                      'governing_body','owner_review','legacy_relationship')
  );

ALTER TABLE public.athlete_status_periods
  ADD CONSTRAINT athlete_status_periods_identity_uq
  UNIQUE NULLS NOT DISTINCT
    (athlete_id, status_axis, status_value, effective_from, effective_to, resolution_method);

WITH eligible AS (
  SELECT ats.ats_id, ats.athlete_id, ats.team_id, ats.season_code,
         ats.year_in_school, ats.status, ats.is_redshirt,
         team.school_id, team.gender team_gender,
         membership.school_competition_membership_id,
         split_part(ats.season_code, '-', 1)::int start_year,
         split_part(ats.season_code, '-', 2)::int end_year
  FROM public.athlete_team_seasons ats
  JOIN public.teams team USING (team_id)
  JOIN public.schools school ON school.school_id = team.school_id
  JOIN public.athletes athlete USING (athlete_id)
  JOIN public.school_competition_memberships membership
    ON membership.school_id = school.school_id
   AND membership.is_primary
   AND membership.verification_status <> 'unresolved'
   AND membership.membership_status IN ('active','affiliate','provisional','independent')
   AND membership.valid_to IS NULL
  WHERE school.institution_type = 'collegiate'
    AND ats.season_code ~ '^\d{4}-\d{4}$'
    AND split_part(ats.season_code, '-', 2)::int
        = split_part(ats.season_code, '-', 1)::int + 1
    AND (athlete.gender IS NULL OR team.gender IS NULL OR athlete.gender = team.gender)
)
INSERT INTO public.athlete_status_evidence (
  athlete_id, status_axis, status_value, effective_from, effective_to,
  evidence_type, source, source_record_key, source_snapshot_hash,
  verification_status, confidence, evidence
)
SELECT eligible.athlete_id, 'career_stage', 'collegiate',
       make_date(eligible.start_year, 7, 1), make_date(eligible.end_year, 7, 1),
       'legacy_relationship', 'legacy_database',
       'athlete_team_seasons:' || eligible.ats_id,
       md5(concat_ws('|', eligible.ats_id, eligible.athlete_id, eligible.team_id,
                     eligible.season_code, eligible.year_in_school,
                     eligible.status, eligible.is_redshirt)),
       'unresolved', NULL,
       jsonb_build_object(
         'athlete_team_season_id', eligible.ats_id,
         'team_id', eligible.team_id,
         'school_id', eligible.school_id,
         'team_gender', eligible.team_gender,
         'season_code', eligible.season_code,
         'year_in_school', eligible.year_in_school,
         'legacy_status', eligible.status,
         'is_redshirt', eligible.is_redshirt,
         'school_competition_membership_id', eligible.school_competition_membership_id,
         'provenance_limitation', 'legacy relationship has no retained source roster snapshot'
       )
FROM eligible
ON CONFLICT ON CONSTRAINT athlete_status_evidence_source_identity_uq DO NOTHING;

INSERT INTO public.athlete_status_periods (
  athlete_id, status_axis, status_value, effective_from, effective_to,
  resolution_status, resolution_method
)
SELECT evidence.athlete_id, 'career_stage', 'collegiate',
       evidence.effective_from, evidence.effective_to,
       'provisional', 'legacy_team_season_unresolved'
FROM public.athlete_status_evidence evidence
WHERE evidence.source = 'legacy_database'
  AND evidence.evidence_type = 'legacy_relationship'
  AND evidence.verification_status = 'unresolved'
GROUP BY evidence.athlete_id, evidence.effective_from, evidence.effective_to
ON CONFLICT ON CONSTRAINT athlete_status_periods_identity_uq DO NOTHING;

INSERT INTO public.athlete_status_period_evidence (
  athlete_status_period_id, athlete_status_evidence_id
)
SELECT period.athlete_status_period_id, evidence.athlete_status_evidence_id
FROM public.athlete_status_evidence evidence
JOIN public.athlete_status_periods period
  ON period.athlete_id = evidence.athlete_id
 AND period.status_axis = evidence.status_axis
 AND period.status_value = evidence.status_value
 AND period.effective_from = evidence.effective_from
 AND period.effective_to = evidence.effective_to
 AND period.resolution_status = 'provisional'
 AND period.resolution_method = 'legacy_team_season_unresolved'
WHERE evidence.source = 'legacy_database'
  AND evidence.evidence_type = 'legacy_relationship'
ON CONFLICT DO NOTHING;

COMMENT ON CONSTRAINT athlete_status_periods_identity_uq ON public.athlete_status_periods IS
  'Makes deterministic status resolution/backfill replay idempotent without merging different methods.';

COMMIT;
