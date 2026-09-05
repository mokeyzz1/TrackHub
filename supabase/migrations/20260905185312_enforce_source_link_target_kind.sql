-- Parent/individual targets must match their entity kind. Relay-leg compatibility rows are
-- intentionally not remapped or constrained to a new representation by this change.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE ingest.source_links ADD CONSTRAINT source_links_target_kind_ck CHECK (
  (entity_type <> 'individual_result' OR relay_result_id IS NULL)
  AND (entity_type <> 'relay_result' OR result_id IS NULL)
) NOT VALID;
ALTER TABLE ingest.source_links VALIDATE CONSTRAINT source_links_target_kind_ck;
