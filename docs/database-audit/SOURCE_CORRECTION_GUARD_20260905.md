# ING-02c2: explicit changed-source performance review

The linked-source fast path previously treated any later observation with the same provider key
as an exact replay. The writer now loads the exact linked canonical fact under its existing
promotion transaction and advisory locks. A changed entity kind, meet/event/actor, known team,
normalized mark, placing, or contradictory known date is held as `source_correction_required`.
The old fact and link remain untouched; new evidence remains on its own observation/version.

Identical numeric formatting is still a replay. Supplied points are read as a numeric token, never
recomputed or concatenated with annotation digits. Missing source dates are not contradictions
of dates filled from the meet; missing affiliation values are not guessed. The canonical source
target is selected by its actual FK, not re-inferred from a nearby candidate result.

Quarantine replay preserves the specific correction reason rather than relabeling it as generic
validation failure. Three unit tests and 17 PostgreSQL tests pass, including changed individual
and relay marks, preserved old facts, no inserted replacement, repeated quarantine, normal replay,
concurrent ingestion, rollback, evidence history and source-link constraints. The shared ingestion
suite also passes all 234 tests. All database writes for these tests are isolated synthetic data.

This is shared worker code in the checkout, not a live repair run or a new migration. No production
observation was promoted/quarantined by this checkpoint. Revert the code checkpoint to undo the
behavior; preserve all existing snapshots and source links. No live row before-images were needed.

Scope: this is detection/holding, not an operator approval/apply workflow. Round-label compatibility,
wind/annotation-only differences, relay-lineup changes, legacy observations with unavailable raw
snapshots and uncoordinated direct writers still require explicit review. Existing linked legacy
observations without a snapshot retain their previous fact without reconstructing raw evidence.
No athlete identity merge, participation-model rewrite or automatic correction is authorized here.
