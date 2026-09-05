# ING-02d: source-link target-kind invariant

The database already enforced at most one target and exactly one for a linked source, but allowed
an individual source to target a relay parent or a relay-parent source to target an individual
result. Added the narrowly scoped `source_links_target_kind_ck`, validated live in migration
`20260905185312_enforce_source_link_target_kind`. No source links or public rows were changed.

All 41,214 existing links pass. Breakdown: 16,488 linked individual sources, 5,099 linked relay
parents, 19,610 linked relay-leg sources, and 17 quarantined records without targets. Relay-leg
sources deliberately point to individual result compatibility rows in the current writer. An
initial broad diagnostic counted those as incompatible; code review corrected that interpretation
before any constraint was proposed or applied. They were preserved, not relabeled or repaired.
This does not approve that compatibility representation as the final relay data model.

16 PostgreSQL tests pass (15 scenarios plus parent) with the constraint installed in an isolated
schema clone. New tests verify parent promotion/replay produces one team performance with one
source link, both invalid target directions raise CHECK violations, and legacy leg compatibility
remains allowed. Metadata-only rollback is tested inside the fixture transaction: dropping only
the new constraint removes the rule without deleting links; outer rollback restores the fixture.

Live postconditions: `convalidated=true`, exact intended CHECK definition, 41,214 links retained.
No new RLS policy, grant, function, index or table was required. The fresh preserved schema archive
is the pre-change baseline. Targeted migration application did not execute held or unrelated SQL.
Emergency rollback is `ALTER TABLE ingest.source_links DROP CONSTRAINT source_links_target_kind_ck`
inside a bounded transaction; this reopens invalid writes and should require a demonstrated need.

Remaining: observation/link identity consistency, explicit source-correction workflow, legacy relay
participation normalization, and direct writer audit. No blanket completion of ING-02 or MODEL-01.
