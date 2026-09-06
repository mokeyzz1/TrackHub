# Outdoor 2026 4x100 Drake Relays scholastic structure review

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Date: 2026-09-03  
Scope: `outdoor-2026-4x100-source-reconciliation-v1`  
Status: private review only; no public rows, aliases, or result facts changed.

## Finding

The corrected Drake Relays audit has 281 unresolved-source actions across 178 labels. The
private source facts are not a collegiate-only event: TFRRS publishes separate high-school and
middle-school 4x100 sections. The correct cleanup boundary is therefore division-aware identity
holding, not broad aliasing.

| Private label pattern | Labels | Actions | Holding decision |
|---|---:|---:|---|
| Explicit middle-school suffix (`MS`) | 43 | 78 | Hold as youth/middle-school; never map to a high-school or college team |
| Explicit high-school suffix (`HS`) | 2 | 2 | Hold as scholastic high-school labels |
| Unsuffixed scholastic labels | 130 | 198 | Likely school programs from the Drake HS section, but require school-level confirmation |
| Squad/program descriptors (`crew`, `unified`, `all stars`) | 3 | 3 | Hold as program/squad labels; do not create a separate school |

These categories sum to the full 178 labels and 281 actions in the private Drake unresolved set.
The packet intentionally does not enumerate 178 proposed mappings: a source label such as
“Prairie, CR” or “Ames” is not a safe alias until the canonical campus and division are known.

## Direct source evidence

- [TFRRS Drake high-school men's 4x100](https://www.tfrrs.org/results/95611/5986975/116th_Drake_Relays/Mens-4-x-100-Relay)
  lists school teams such as Dowling Cath, Prairie, Gilbert, Johnston, Waukee NW, CR Jefferson,
  Norwalk, and CR Kennedy.
- [TFRRS Drake high-school women's 4x100](https://www.tfrrs.org/results/95611/5986974/116th_Drake_Relays/Womens-4-x-100-Relay)
  lists school teams such as SE Polk, Linn-Mar, Valley WDM, ADM, Pleasant Valley, Prairie, and
  Decorah.
- [TFRRS Drake middle-school 4x100](https://www.tfrrs.org/results/95611/5986973/116th_Drake_Relays/Mens-4-x-100-Relay)
  explicitly lists Northview MS, Waukee Northwest MS, Callanan MS, Ames MS, Southeast Polk MS,
  Pella MS, Bondurant-Farrar MS, and St. Francis of Assisi MS.
- The [Drake Relays meet page](https://tf.tfrrs.org/results/95611/116th_Drake_Relays) exposes
  multiple 4x100 event sections, confirming that the same meet contains separate divisions.

## Examples of labels requiring special handling

- `Ankeny Centennial Jags Black` and `Ankeny Centennial Jags Silve` are relay-squad labels;
  retain them as source squads under Ankeny Centennial if a canonical school is later verified.
- `Norwalk Gold`, `Norwalk Purple`, and `Norwalk White` are squads, not three schools.
- `Ames MS`, `Pella MS`, `Waukee Northwest MS`, and similar labels must remain distinct from
  their high-school counterparts.
- `Roosevelt HS The Rider crew`, `Spirit Lake Unified`, and `Southview All Stars` are program or
  inclusion labels, not canonical varsity schools.

## Safe next step

Keep all 281 Drake actions in private `manual_review`. Add no aliases and no public team rows from
the label text alone. The next promotion review should work from the TFRRS division/section and
then verify each campus against the school catalog; middle-school and program/squad records need
an explicit model decision before any public promotion.
