# DATA-01: source-backed repair reconciliation

Status: complete with explicit holds on 2026-09-09. This checkpoint reconciles every reviewed
source-backed repair packet against the existing private before-image archive and current live
facts. It does not authorize a new bulk repair.

## Applied, reversible repair families

The existing `ingest.fact_cleanup_archive` contains 141,884 before-images across 24 operation
keys. The DATA-01 repair families are all archived and retain their paired rollback scripts or
guarded rollback procedures:

- timing-platform known providers: 1,342 meets, plus 16 completed `.anet.live` meets and 96
  verified AthleticLIVE custom-domain meets;
- verified USSU affiliations: 16 athletes, 174 individual results, five relay parents and four
  relay-member links, followed by four athletes and 27 women's results;
- confirmed collegiate profiles: 1,184 profile moves, followed by 178 association-unclassified
  collegiate profiles across 14 verified institutions;
- Clark/Lane source-backed result repair: 52 legacy relay-leg results and 13 relay parents; and
- Sacramento City College source-backed individual result repair: 18 results to canonical team
  `4066`.

Each applied family used exact affected-ID assertions, archived before-images, rollback rehearsal,
and postconditions. No archive operation is missing from the reviewed packets, and no repair
created a second results, relay, or affiliation table.

## Current holds and why they are safe

The current timing-platform scan still finds 216 rows that would change from a blank/fallback
label, but they are generic or intermediary hosts without provider-specific evidence. They remain
held; URL text alone is not a scraper contract.

For the 1,188 association-confirmed collegiate athletes, live results contain 8,566 rows. Of the
8,469 rows whose `team_id` is still NULL, all 157 rows with a private TFRRS source link are relay
legs (`146` `4x100m`, `11` `4x400m`). There are zero source-linked non-relay rows remaining. The
other 8,312 teamless results have no exact private source link and remain held. Relay identity and
relay-result repair are intentionally paused; no team is inferred from an athlete roster alone.

The 178-athlete association-unclassified remainder has six source-linked relay rows and 620
results without exact stored result provenance, as recorded in its packet. The 14 USMAPS prep
athletes, clubs, unattached identities, and scholastic/international candidates remain outside the
collegiate repair scope and unchanged.

## Decision and preservation

The DATA-01 completion rule is satisfied: every deterministic, source-proven repair that was
reviewed has been applied with a reversible before-image, and every unresolved group is explicitly
held with a concrete evidence requirement. No delete, merge, source-ID rewrite, roster inference,
or result recalculation is authorized by this checkpoint. Future repairs require a new reviewed
manifest and the existing archive/rollback protocol.
