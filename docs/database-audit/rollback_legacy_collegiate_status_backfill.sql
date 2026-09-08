BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DELETE FROM public.athlete_status_period_evidence bridge
USING public.athlete_status_evidence evidence
WHERE evidence.athlete_status_evidence_id = bridge.athlete_status_evidence_id
  AND evidence.source = 'legacy_database'
  AND evidence.evidence_type = 'legacy_relationship';

DELETE FROM public.athlete_status_periods
WHERE resolution_method = 'legacy_team_season_unresolved';

DELETE FROM public.athlete_status_evidence
WHERE source = 'legacy_database'
  AND evidence_type = 'legacy_relationship';

ALTER TABLE public.athlete_status_periods
  DROP CONSTRAINT athlete_status_periods_identity_uq;

ALTER TABLE public.athlete_status_evidence
  DROP CONSTRAINT athlete_status_evidence_type_ck;
ALTER TABLE public.athlete_status_evidence
  ADD CONSTRAINT athlete_status_evidence_type_ck CHECK (
    evidence_type IN ('roster','individual_result','relay_result','source_profile',
                      'governing_body','owner_review')
  );

COMMIT;
