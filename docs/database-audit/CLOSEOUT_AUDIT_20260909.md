# CLOSE-01: database workstream closeout and explicit hold register

Status: review complete with explicit holds on 2026-09-09. This packet closes the current
ordered audit pass; it is not a claim that every unresolved source or product decision has been
silently resolved.

## What was rechecked

- The live application boundary currently contains 26 `public` base tables, eight `public` views,
  11 private `ingest` tables, and nine private `archive` tables. The exhaustive register remains
  2,767 individually addressable entries; captured platform/configuration entries retain their
  explicit purpose and next action rather than being marked complete by inference.
- Migration history is reconciled: 104 active local files match 104 live ledger entries with zero
  preflight errors. The final security migration is ledger version `20260908213000`.
- Source-backed repairs are reconciled in `DATA_REPAIR_RECONCILIATION_20260909.md`; no
  unreviewed bulk repair, duplicate table, or public repair command was introduced.
- API read contracts, role boundaries, function/trigger ACLs, and workload-backed indexes are
  covered by `API_CONTRACT_AUDIT_20260909.md`, `SECURITY_CONTRACT_AUDIT_20260909.md`, and
  `PERFORMANCE_CONTRACT_AUDIT_20260909.md`.

## Verification set

- 259 ingestion/shared regression tests passed.
- 24 database-history/register tests passed.
- Three workflow-safety tests passed.
- Live migration preflight passed for all 104 files.
- Live security postconditions passed: public reads remain public-only, private schemas/views are
  denied to browser roles, waitlist insertion remains insert-only, existing RPC grants are intact,
  and future postgres-owned functions no longer inherit browser `EXECUTE`.
- Current index catalog check found 152 application indexes, all valid and ready; representative
  fact and team-summary plans use the retained supporting indexes.

## Explicit unresolved holds

These are visible decisions, not failures hidden by this closeout:

1. Remaining generic/intermediary timing-platform candidates stay held until provider-specific
   evidence exists (the current scan still identifies 216 rows that would change).
2. Confirmed collegiate teamless results without exact individual source evidence stay held. The
   157 source-linked remainder is relay-only and relays are paused; the other 8,312 have no exact
   source link. No roster-only team inference is allowed.
3. Meet/source identity collisions, broader result identity, relay-parent identity, season/
   environment/round taxonomy, PR-cache parity, and multi-event component modeling remain held
   under the existing decision register. Supplied multi-event totals remain authoritative; no
   score recalculation was introduced.
4. Current/post-collegiate/professional status ingestion and UI adoption remain open under
   MODEL-01d. Provisional evidence is private and does not leak into public status views.
5. Live-results retirement/replacement and the paused 4x100 workstream remain deferred by product
   priority. Their tables, queues, and source evidence are preserved.

## Preservation decision

No table, column, result, athlete, relay, meet, source payload, or policy was deleted in the
closeout. Every applied data repair retains an exact before-image in the existing private archive;
every schema change has a tested rollback companion. Future work must begin from this hold register
and the single `MASTER_CHECKLIST.md`, with a new reviewed manifest before any additional mutation.
