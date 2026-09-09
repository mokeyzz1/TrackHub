# ID-01: canonical athlete identity audit — 2026-09-08

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md). This is a
> read-only audit; no athlete, alias, external-ID, result, relay, or school row was changed.

## Result

The canonical identity surfaces are internally consistent enough to keep operating safely:

- `public.athletes` has 151,534 rows (151,529 active); 106,751 retain a TFRRS ID, 99,811 retain an
  Athletic.net URL, and 30,159 have neither legacy source column. No placeholder-like names remain.
- Legacy TFRRS IDs have zero duplicate groups. The existing non-unique index is appropriate because
  reviewed secondary identities belong in the identity maps, not in a single athlete column.
- There are 209 duplicated Athletic.net URL groups (209 extra rows). 151 groups have the same
  normalized name/gender/school shape; 58 are mixed-shape groups. All 209 remain held. A URL is not
  promoted to a table-wide unique constraint from this evidence.
- `public.external_ids` has 356 verified rows for 353 athletes: 283 TFRRS, 58 Athletic.net, and 15
  DirectAthletics rows. There are no duplicate `(source, external_key)` groups and no orphan targets.
- `ingest.athlete_aliases` has 1,339 active rows for 1,324 athletes: 947 TFRRS, 275 Athletic.net,
  and 117 TrackScoreboard rows. There are no duplicate `(source, source_athlete_key)` groups and no
  orphan targets. Its source/method/gender/status checks and target foreign key are present.

## Interpretation and decisions

The existing identity design is intentionally two-layered: `athletes` keeps legacy primary source
columns for compatibility, while `external_ids` and `ingest.athlete_aliases` preserve reviewed
secondary source identities. The audit confirms that the uniqueness constraints and foreign keys
protect those maps. Alias key formats are source-specific: TFRRS aliases include 285 numeric and
662 nonnumeric keys, while all 275 Athletic.net aliases are numeric. Therefore, a simple join from
every legacy column to every alias would produce false “missing” findings; no bulk rewrite is safe.

The 209 shared Athletic.net URL groups are collision evidence, not merge authorization. The 151
same-shape groups are candidates for a future source-backed review; the 58 mixed-shape groups must
remain held. Existing reviewed secondary mappings, the four contradictory same-performance pairs,
and any new source conflicts remain protected by the resolver’s fail-closed behavior.

No new table or global URL constraint is proposed in ID-01. The safe improvement path is to keep
source-qualified identity resolution ahead of legacy columns, add only explicitly reviewed aliases
or external IDs, and route ambiguous records to private review. Merge or URL ownership work belongs
under `DATA-01`/`ING-02c`, with before-images and rollback tests.

The reproducible audit is `id01_identity_audit.js`; it prints aggregate counts, constraint
definitions, and index definitions without exposing source identifiers or names.
