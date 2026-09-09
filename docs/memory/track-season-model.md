---
name: track-season-model
description: How track & field seasons work in TrackHub (span two calendar years; Indoor/Outdoor/XC) — do NOT split by calendar year
metadata: 
  node_type: memory
  type: project
  originSessionId: b63228a2-f910-41f5-bd61-21edda8f8e0c
---

**Track seasons span two calendar years — never analyze meets by `date_part('year', date)`.** A
competition season starts around December and runs into the next year; indoor and outdoor
belong to the same academic/competition year. So a calendar-year cut chops a season in half
and is misleading (this bit me — the user corrected it).

Three season types: **Indoor** (Dec–Mar), **Outdoor** (Mar–Jun), **XC / cross country** (Aug–Nov).

The meets table has a `season` column (text) and `level` column (division). Observed `season`
values are like `"Indoor 2025"`, `"Outdoor 2024"`, `"XC 2025"` — but labeling is inconsistent:
1,428 rows are just `"indoor"` with no year. Normalizing these is part of the DB cleanup. Use
the `season` column, not raw dates, when grouping by season. See [meet-url-backfill-state] and
[results-data-model].
