# Meet identity and source-provenance review — 2026-09-04

## Scope

This is a read-only production review of `public.meets`. It follows the team/relay identity
checkpoint because result uniqueness cannot be defined until the meet/source identity contract is
clear. No meet, result, URL, policy, table, or constraint was changed.

The reproducible query set is `docs/database-audit/meet_identity_scan.sql`.

## Live coverage

| Measure | Rows |
| --- | ---: |
| Meets | 12,978 |
| Missing location | 11,282 |
| Missing timing-site `meet_url` | 11,142 |
| Missing original `source_url` | 12,974 |
| Missing `tfrrs_meet_id` | 12,906 |
| Missing TFRRS results URL | 12,513 |
| Missing Athletic.net results URL | 12,382 |
| Missing World Athletics results URL | 12,978 |
| Missing `end_date` | 0 |
| Missing `level` | 11,281 |
| Missing `timing_platform` | 11,358 |
| Missing `results_source` | 1,045 |

The canonical name/date/status/season fields are populated, but source identity is sparse. `tfrrs_url`
is populated on 465 rows and `athletic_net_results_url` on 596 rows; `tfrrs_meet_id` is populated on
only 72 rows. `source_url` is an original USTFCCCA pointer and is not a substitute for a per-source
results identity.

## Collision findings

| Candidate | Groups | Extra rows | Interpretation |
| --- | ---: | ---: | --- |
| Normalized TFRRS URL | 10 | 13 | Same URL points at multiple canonical rows; hold as aliases/source conflict |
| Normalized Athletic.net URL | 5 | 5 | Same results page points at multiple rows; hold for source/date review |
| Normalized name + date | 2 | 2 | `Grubbys Easter Classic`/`Grubby's Easter Classic` and a typo pair; review, do not merge by name alone |

The TFRRS URL collision is not theoretical. The official TFRRS page for result `94971` currently
identifies itself as the **Tyson Invitational, February 13–14, 2026**, while production assigns that
same URL to Tyson Invitational rows dated February 14, 2020; February 12, 2021; and February 11,
2022, plus related historical result rows. This proves that the URL value, as stored today, is not a
stable historical meet key. It must be reconciled with source snapshots or archived source records
before any unique index or automatic reassignment is considered.

The official TFRRS page for result `95531` identifies the 2026 SNHU Spring Invitational and confirms
that the URL itself is a results page, but production has two rows using it on March 26 and March 28,
2026. Those rows may represent separate editions/segments or a duplicate import; source-level
comparison is required.

### Same-URL fact-set evidence

The read-only fingerprint query found three historical TFRRS URL pairs whose **individual result
sets are byte-equivalent at the canonical identity level** (same athlete, event, team, mark, place,
and round for every row):

| URL | Meet IDs / dates | Individual rows | Relay rows |
| --- | --- | ---: | --- |
| `/results/92756` | 8202 (2023-02-04) / 2879 (2025-02-07) | 959 = 959 | 47 / 27 |
| `/results/93948` | 11160 (2020-02-14) / 3274 (2022-02-11) | 1,058 = 1,058 | 30 / 40 |
| `/results/95227` | 11014 (2021-02-13) / 1455 (2022-02-11) | 2,487 = 2,487 | 62 / 87 |

This is strong evidence of historical result-set contamination or source-page reuse. It is not a
survivor decision: relay sets differ, source pages can be edited, and the result rows retain
different meet parents. Preserve both rows while a source snapshot/lineage review determines which
meet owns each fact.

## Bounded source-review pass

The duplicate groups were compared in one read-only pass against private source records and
NULL-safe canonical fact overlap:

| Athletic.net URL | Meet IDs | Individual rows (A / B; overlap) | Relay rows (A / B; overlap) | Classification |
| --- | --- | ---: | ---: | --- |
| `/meets/66223` | 12747 / 12914 | 461 / 348; 0 | 30 / 2; 0 | Shared page key with disjoint fact sets; keep both |
| `/meets/67952` | 12587 / 12620 | 428 / 1,255; 0 | 14 / 24; 0 | Shared page key with disjoint fact sets; keep both |
| `/meets/70965` | 12936 / 12937 | 46 / 230; 0 | 5 / 5; 0 | Shared page key with disjoint fact sets; keep both |
| `/meet/639904` | 11911 / 11912 | 770 / 770; 770 | 0 / 163; 0 | Individual set copied across a combined-events/parent pair; hold parent mapping |
| `/meet/651507` | 12325 / 12472 | 202 / 202; 194 | 4 / 4; 1 | Same-day name variant with substantial overlap; hold survivor decision |

The first three rows are not duplicates merely because the URL is shared: their fact sets are
disjoint. The `639904` pair has byte-equivalent individual rows but different relay coverage and
different meet dates/locations, so the combined-events row must remain a separate parent candidate.
The `651507` pair is the strongest actual-duplicate candidate, but four individual rows and three
relay rows differ; no merge is authorized without source ownership evidence.

Nine of the ten duplicate TFRRS URL groups have no private source records. The only group with
source records is `/results/96401`: all 24 staged TFRRS records and their links point to meet 12632
(Bauer Open, April 15, 2026); meet 12562 (April 18, 2026) reuses the same URL but has no linked
source records. This is strong ownership evidence for the staged rows, not permission to delete or
reassign the April 18 facts.

The name/date candidates add two different signals. The Grubbys pair has 11 source links on each
side: Athletic.net records (three relay parents plus eight legs) point to meet 12325, while TFRRS
records (three relay parents plus eight legs) point to meet 12472. Their separate source keys
(`/meets/651507` versus `/results/96019`) and partially different facts indicate a multi-source
duplicate candidate, not a row that can be deleted without unioning facts and preserving both
lineage paths. The South Coast pair (12788 / 12792) has byte-equivalent individual and relay sets
but no private source links; only meet 12792 has a timing-site URL. It remains held pending a
source snapshot.

## Constraints and access boundary

- `meets` has a primary key on `meet_id` and checks for the current `status` and `results_source`
  vocabularies, but no unique constraint on source URLs, source IDs, or name/date.
- The public table is SELECT-only for `anon` and `authenticated`; no policy was added or changed.
- Existing URL and date indexes support lookup, but they do not establish identity.

## Design conclusion

The meet table is a canonical fact parent with multiple source/provenance columns that currently
mix three different concepts: a timing-site link, a results-page link, and an original directory
pointer. The sparse `tfrrs_meet_id` column and duplicate results URLs mean we must not make any source
URL unique or delete “duplicates” from names/dates alone.

The safe target is a source-aware meet identity/alias contract backed by the existing private source
records and cleanup archive. Until that contract is proven, keep all 12,978 meet rows, preserve raw
URLs, and treat duplicate URL groups as review queues. No new table is justified by this scan alone.

## Next gate

The bounded pass is complete. The next gate is to obtain source snapshots for the nine TFRRS groups
without private lineage and for the strongest Athletic.net/name-date candidates, then classify
same-meet alias, multi-day/segment, or actual duplicate. Only then design a reversible
reassignment/archive plan.
