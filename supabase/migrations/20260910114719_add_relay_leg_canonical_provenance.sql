-- Relay legs are memberships in a team performance, not individual performance facts.
-- Keep the existing result_id links readable during the historical reconciliation, while giving
-- all new relay-leg observations an exact canonical relay_athletes target.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE ingest.observations
  ADD COLUMN canonical_relay_athlete_id integer
    REFERENCES public.relay_athletes(relay_athlete_id) ON DELETE RESTRICT;

ALTER TABLE ingest.source_links
  ADD COLUMN relay_athlete_id integer
    REFERENCES public.relay_athletes(relay_athlete_id) ON DELETE RESTRICT;

CREATE INDEX ingest_observations_canonical_relay_athlete_idx
  ON ingest.observations (canonical_relay_athlete_id)
  WHERE canonical_relay_athlete_id IS NOT NULL;

CREATE INDEX ingest_source_links_relay_athlete_idx
  ON ingest.source_links (relay_athlete_id)
  WHERE relay_athlete_id IS NOT NULL;

ALTER TABLE ingest.source_links
  ADD CONSTRAINT source_links_target_count_v2_ck CHECK (
    num_nonnulls(result_id, relay_result_id, relay_athlete_id) <= 1
  ) NOT VALID;

ALTER TABLE ingest.source_links
  VALIDATE CONSTRAINT source_links_target_count_v2_ck;

ALTER TABLE ingest.source_links
  DROP CONSTRAINT source_links_linked_target_ck;

ALTER TABLE ingest.source_links
  ADD CONSTRAINT source_links_linked_target_ck CHECK (
    link_status <> 'linked'
    OR num_nonnulls(result_id, relay_result_id, relay_athlete_id) = 1
  ) NOT VALID;

ALTER TABLE ingest.source_links
  VALIDATE CONSTRAINT source_links_linked_target_ck;

ALTER TABLE ingest.source_links
  DROP CONSTRAINT source_links_target_kind_ck;

-- Legacy relay_leg -> result_id links remain valid until the evidence-backed cleanup runs.
-- New writer tests require relay_leg -> relay_athlete_id and never create another legacy link.
ALTER TABLE ingest.source_links
  ADD CONSTRAINT source_links_target_kind_ck CHECK (
    link_status <> 'linked'
    OR (
      (entity_type <> 'individual_result'
        OR (result_id IS NOT NULL AND relay_result_id IS NULL AND relay_athlete_id IS NULL))
      AND (entity_type <> 'relay_result'
        OR (result_id IS NULL AND relay_result_id IS NOT NULL AND relay_athlete_id IS NULL))
      AND (entity_type <> 'relay_leg'
        OR (relay_result_id IS NULL AND num_nonnulls(result_id, relay_athlete_id) = 1))
    )
  ) NOT VALID;

ALTER TABLE ingest.source_links
  VALIDATE CONSTRAINT source_links_target_kind_ck;

ALTER TABLE ingest.observations
  ADD CONSTRAINT observations_canonical_target_v2_ck CHECK (
    num_nonnulls(canonical_result_id, canonical_relay_id, canonical_relay_athlete_id) <= 1
  ) NOT VALID;

ALTER TABLE ingest.observations
  VALIDATE CONSTRAINT observations_canonical_target_v2_ck;

COMMENT ON COLUMN ingest.observations.canonical_relay_athlete_id IS
  'Canonical relay membership selected for a relay_leg observation; never an individual result.';

COMMENT ON COLUMN ingest.source_links.relay_athlete_id IS
  'Exact relay_athletes provenance target for newly promoted relay-leg source records.';
