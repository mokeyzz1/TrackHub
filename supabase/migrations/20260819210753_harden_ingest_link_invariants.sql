-- A linked provenance record must point to exactly one canonical fact row.
-- This is additive and safe because the control plane has no committed links yet.

ALTER TABLE ingest.source_links
  ADD CONSTRAINT source_links_linked_target_ck
  CHECK (link_status <> 'linked' OR num_nonnulls(result_id, relay_result_id) = 1);
