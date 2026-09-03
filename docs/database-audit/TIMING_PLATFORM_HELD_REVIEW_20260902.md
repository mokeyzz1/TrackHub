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

After isolating the `.anet.live` family, 308 of the original 325 held changes remain unresolved.
They include generic timing domains and intermediary hosts such as TrackScoreboard-backed pages.
Those cannot be assigned a canonical provider from URL text alone and remain untouched pending
source-specific review.

No additional production repair was executed in this review.
