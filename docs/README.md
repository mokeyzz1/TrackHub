# TrackHub docs — start here

**Everything lives under `docs/`.** Before 2026-08-14 it was 37 markdown files spread across
`docs/`, `backend/`, `backend/scripts/`, `scrapers/tfrrs/`, and an agent-memory directory
**outside the repo entirely** — which is why `CLAUDE.md` pointed at `memory/backend-rebuild-status.md`
and that path did not exist here. Consolidated so there is one place to look.

```
docs/
  README.md          <- you are here: the index
  *.md               <- ACTIVE working docs (8)
  memory/            <- cross-session history and state
  reference/         <- stable background: schema, domain, architecture, platform notes
  archive/           <- superseded; kept for history, do NOT act on these
```

---

## Read these first

| doc | when you need it |
|---|---|
| **[OWNER_DECISIONS](OWNER_DECISIONS.md)** | **every decision, correction and technique the owner has given — READ FIRST, do not re-derive these** |
| **[DATA_ISSUES_TRACKER](DATA_ISSUES_TRACKER.md)** | every known data problem, its real size, and status |
| **[BACKEND_PRIORITIES](BACKEND_PRIORITIES.md)** | what to work on next, ordered by deadline |
| **[DEDUP_METHOD](DEDUP_METHOD.md)** | **read before writing ANY cleanup script** — nine rules that each cost a near-miss |
| **[RECOVERY](RECOVERY.md)** | every destructive change and how to undo it |

## The rest of the active set

| doc | contents |
|---|---|
| [DATA_SOURCE_STRATEGY](DATA_SOURCE_STRATEGY.md) | TFRRS vs athletic.net, the dual-source plan, the recovery cascade for meets with no link |
| [MARK_CODES](MARK_CODES.md) | every non-numeric mark (`DNS` `NT` `ENR` `NP` `NWI`…) — **all are results, never junk** |
| [COMMUNITY_BUILD_PLAN](COMMUNITY_BUILD_PLAN.md) | accounts, claimed profiles, social — and which backend work actually blocks it |
| [SCALING_PLAN](SCALING_PLAN.md) | 10k–20k users: precompute, cache, index per access pattern |

## memory/ — what happened and why

`backend-rebuild-status.md` is the single source of truth for the rebuild's history. The rest are
topic notes. These were previously outside the repo; they are now versioned with the code.

## reference/ — stable background

Schema (`TARGET_SCHEMA_BLUEPRINT`), domain rules (`DOMAIN_LOGIC`), architecture, design system,
column retirement, and platform notes (`SCRAPING_PIPELINE`, `ATHLETIC_NET_LIVE_GUIDE`,
`LIVE_RESULTS_INVESTIGATION` — the last records *why* in-app live results was abandoned).

## archive/ — superseded, do not act on

`DATABASE_CLEANUP_PLAN`, `NEXT_BUILD_CLEANUP_PLAN`, `OVERNIGHT_BACKFILL_PLAN`,
`EVENT_MAPPING_PROPOSAL`, `COMPLETE_CODEBASE_DOCUMENTATION`. Their live content moved into the
tracker and the priorities doc.

---

## ⚠️ Two rules that exist because they were broken

**1. "Fixed" means the DATA is fixed, not just the code.**
`F7` was recorded as *"Relay time parser required a colon — FIXED in both scrapers"*. True, and
misleading: it fixed future scrapes and did nothing to the **463 meets already in the database**
whose 4x100 had been stored as status codes. The owner reasonably believed the 4x100s were
handled; they were not. A scraper fix and a data repair are **two separate lines**, and the second
one is not done until it is measured.

**2. One fact, one place.**
The tracker said F7 was fixed while M1 said 4x100s were still broken. Both were true, in different
files, and the reader got the wrong answer. If two docs can disagree, they will — put the fact in
one doc and link to it.
