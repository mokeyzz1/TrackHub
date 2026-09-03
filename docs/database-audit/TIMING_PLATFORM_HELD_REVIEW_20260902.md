# Held timing-platform review

Date: 2026-09-02

Status: reviewed and partially applied; remaining fallback rows are still held

## `.anet.live` family

The project already treats `anet.live` as an Athletic.net result host in
`scrapers/meets/scrape_meets.js` (`ATHLETIC_NET_HOST = /athletic\\.net|anet\\.live/i`). The
official Athletic.net help center also identifies AthleticLIVE as its live/final results service
and links the `anet.live` domain for AthleticLIVE tooling:

<https://support.athletic.net/article/ndscjlv6gc-what-is-athletic-live>

The held set contains 17 `.anet.live` rows:

| Host family | Rows | Status treatment |
|---|---:|---|
| `dakotatiming.anet.live` | 11 | 10 completed eligible for review; 1 upcoming held |
| `uwwtrack.anet.live` | 2 | completed |
| `beartoothtrack.anet.live` | 1 | completed |
| `firsttimeout.anet.live` | 1 | completed |
| `phototiming.anet.live` | 1 | completed |
| `swtiming.anet.live` | 1 | completed |

Sixteen rows are completed meets and are high-confidence candidates for `timing_platform =
'athletic_net'`. The one exception is meet `94975` (Augustana Twilight, 2026-09-04), which is
`upcoming` and currently `other_timing`; it remains held to avoid changing active scraper routing
without a separate approval.

The completed-subset candidate fingerprint is:

`cb2a8186d5d6392b96b9cbccd49703eb` for the `.anet.live` family alone.

The upcoming exception fingerprint is:

`c5e7dfa5543b6d0e7f23fcc9aa9de5bb`

## Remaining held scope

After the two approved repairs, 216 of the original 325 held changes remain unresolved. They are
generic timing domains and intermediary hosts such as TrackScoreboard-backed pages. They cannot be
assigned a canonical provider from URL text alone and remain untouched pending source-specific
review.

The 216 rows have no `source_url` values. 129 carry a separate TFRRS link and two carry a separate
Athletic.net results link, but those links identify alternate result sources rather than proving
that the generic `meet_url` itself can be handled by the corresponding scraper. They therefore do
not automatically change the timing-platform classification.

A cross-row consistency check found 72 distinct hosts among the 216 rows, and none of those hosts
has an existing non-fallback `timing_platform` label on another meet. There is therefore no
same-host production precedent to use as an automatic mapping. The remaining rows should be handled
by provider-specific evidence (or left as fallback), rather than a broad domain-name guess.

No additional production repair is included in the remaining held scope.

## Isolated repair proposal

The separate scripts `apply_anet_live_completed_repair.sql` and
`rollback_anet_live_completed_repair.sql` were applied to the 16 completed `.anet.live` rows. They
used operation key `20260902_timing_platform_anet_live_completed_repair` and candidate fingerprint
`cb2a8186d5d6392b96b9cbccd49703eb`.

On the isolated PostgreSQL 17 restore, apply, apply replay, rollback, and rollback replay all
passed. Meet `94975` remained `upcoming` with `other_timing` throughout the test. At proposal time
production was unchanged; the 16-row repair was subsequently approved and applied below.

The live preflight for the verified-host batch found 96 completed candidates, fingerprint
`4a080d9bdc57bcd1bf0a5ab06f776d5c`, and four non-completed exceptions. The `.anet.live` upcoming
exception (`94975`) remains preserved, for five active/upcoming exceptions across both batches.

The owner-approved 16-row repair was applied successfully. Operation key
`20260902_timing_platform_anet_live_completed_repair` now contains 16 unique before-images; zero
completed `.anet.live` candidates remain, meet `94975` is still `upcoming` with `other_timing`, and
the total meet count remains 12,878. The archive is retained for rollback.

The verified-host batch was then applied with operation key
`20260902_timing_platform_verified_athleticlive_completed_repair`. It archived 96 unique
before-images and updated all 96 completed candidates. A read-only postcondition confirmed zero
completed candidates remain in that host set, the archive contains 96 rows, and `public.meets`
still contains 12,878 rows. The five active/upcoming exceptions remain unchanged:

| Meet | Status | Stored platform | Host |
|---|---|---|---|
| 95055 George Kyte Invitational | live | `other` | `results.wingfootfinish.com` |
| 94974 Dave Murray Invitational | upcoming | `other` | `results.wingfootfinish.com` |
| 95004 Clash of the Inland Northwest | upcoming | `other_timing` | `live.athletictiming.net` |
| 95012 Fighting Illini Invitational | upcoming | `other` | `results.shazamracing.com` |
| 95042 H.W. 'Bill' Wright Invitational | upcoming | `other` | `results.shazamracing.com` |

Apply replay was a safe no-op, and the paired rollback was verified against the isolated
PostgreSQL 17 restore before production execution. Both archives are retained for rollback.
