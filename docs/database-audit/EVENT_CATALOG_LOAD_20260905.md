# Event catalog loading and measurement review

The resolver now orders alias pages by their primary key and event pages by event ID. It
rejects conflicting normalized aliases rather than silently selecting whichever arrived last.
Same-target spelling/case variants remain valid. Failed reloads leave resolution disabled,
and aliases must have a target in the loaded catalog before it is marked ready.

This follows [Supabase range ordering guidance](https://supabase.com/docs/reference/javascript/using-modifiers-range).
Offset pagination with stable ordering is not an atomic snapshot under concurrent catalog edits;
versioned catalog snapshots remain a separate possible improvement, not a claimed guarantee.

Three regression tests cover multi-page same-target aliases, conflicting aliases across a page
boundary and failed catalog reload after an earlier successful load. Included in the normal
ingestion/CI command: all 247 tests pass. No schema change, live scraper run or alias rewrite.
Rollback is reverting this code checkpoint. No production before-image is needed.

## Read-only live evidence

SQL-normalized aliases have 41 duplicate spelling groups and zero groups with conflicting
event targets. SQL lower/btrim is a diagnostic approximation of the resolver's JS trim/lowercase,
not a Unicode-equivalence proof. Existing same-target aliases were preserved.

All 3,419,178 results were grouped by canonical measurement: 902,335 distance, 88,005 points,
2,428,706 time and 132 unknown. Across this population there were zero rows with both typed
time and distance, zero time events carrying distance, zero distance events carrying time,
and zero negative typed measurements. This does not prove mark correctness, completeness,
status handling, or separation of multi-event components from totals.

The 67-row event catalog's environment labels still need a semantic review. For example,
4x200m is labeled indoor-only, while the verified outdoor
[Penn Relays page](https://www.tfrrs.org/results/96652/Penn_Relays) lists that event.
Do not treat this field as universal competition validity without defining its intended purpose
and checking consumers. No environment labels or historical results were changed here.
Unmapped-event persistence concurrency and error handling also remain open.
