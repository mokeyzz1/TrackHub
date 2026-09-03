# Held timing-platform review

Date: 2026-09-02

Status: read-only review; no additional rows changed

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

`cb2a8186d5d6392b96b9cbccd49703eb`

The upcoming exception fingerprint is:

`c5e7dfa5543b6d0e7f23fcc9aa9de5bb`

## Remaining held scope

After isolating the `.anet.live` family, 309 of the original 325 held changes remain unresolved:
16 `.anet.live` rows are completed candidates and the 17th is already a matching `other_timing`
value on the upcoming meet. The remaining 309 include generic timing domains and intermediary hosts
such as TrackScoreboard-backed pages. They cannot be assigned a canonical provider from URL text
alone and remain untouched pending source-specific review.

The 309 rows have no `source_url` values. 129 carry a separate TFRRS link and two carry a separate
Athletic.net results link, but those links identify alternate result sources rather than proving
that the generic `meet_url` itself can be handled by the corresponding scraper. They therefore do
not automatically change the timing-platform classification.

A cross-row consistency check found 72 distinct hosts among the 309 rows, and none of those hosts
has an existing non-fallback `timing_platform` label on another meet. There is therefore no
same-host production precedent to use as an automatic mapping. The remaining rows should be handled
by provider-specific evidence (or left as fallback), rather than a broad domain-name guess.

No additional production repair was executed in this review.

## Isolated repair proposal

The separate scripts `apply_anet_live_completed_repair.sql` and
`rollback_anet_live_completed_repair.sql` are prepared for the 16 completed rows. They use operation
key `20260902_timing_platform_anet_live_completed_repair` and candidate fingerprint
`cb2a8186d5d6392b96b9cbccd49703eb`.

On the isolated PostgreSQL 17 restore, apply, apply replay, rollback, and rollback replay all
passed. Meet `94975` remained `upcoming` with `other_timing` throughout the test. Production was not
changed; these 16 rows require separate approval.
