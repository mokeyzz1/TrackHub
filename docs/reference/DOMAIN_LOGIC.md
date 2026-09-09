# Domain Logic & Open Questions

The track & field data rules the app depends on, plus decisions to resolve during the backend
rebuild. This is a **living checklist** — we work through these one by one. All of it feeds the
target schema design. (Captured from the builder's hard-won experience; add items as they surface.)

## The cross-cutting truth
PRs, rankings, head-to-head, and progression charts all sit **on top of** the foundation. They
are only trustworthy if events are canonical, environment (indoor/outdoor) is tagged, marks carry
wind/validity, and results link cleanly to meets + athletes. So the foundation work (meet_id,
events, normalization, dedup) is what makes every app feature reliable.

## 1. Event identity / normalization
Free-text `event_name` has many spellings for ONE event:
`200`, `200m`, `200 Meters`, `200 Meter`, `200M`, `200 Invitational`; `60m H` / `60 Meter Hurdles`
/ `60 Meter Hurdles Invitational`; prelim/final or "Invitational" baked into the name; etc.
- [ ] Build a canonical event dictionary (make the empty `events` table real); map every variant to it.

## 2. Indoor vs outdoor
Same name ≠ same event across environments (indoor 200m is a banked 200m track; 60m is indoor-only).
Times are NOT comparable across environments.
- [ ] Tag every result with environment (indoor / outdoor / XC). Compute PRs & rankings per environment.

## 3. Wind & altitude
Outdoor sprints/hurdles/horizontal jumps are only "legal" at wind ≤ +2.0 m/s; indoor has no wind.
Altitude aids sprints/jumps, hurts distance (altitude-adjusted marks may be needed).
- [ ] Capture wind on results; decide how/whether to handle altitude adjustment.

## 4. PRs (personal records) — OPEN QUESTION (builder flagged this)
Today PRs come from **scraping** (`is_pr` flag + `athlete_prs` table, ~479k rows). It's unclear
which scraper sets which PR, and PR correctness depends on event normalization + environment.
- **Question raised:** is scraping PR flags smart, or should PRs be **calculated** from results
  (best legal mark per athlete, per canonical event, per environment)?
- [ ] Decide: scrape vs compute PRs. (Leaning compute — deterministic and always correct once
  events/environment are clean.)

## 5. Rankings / leaderboards
Depends on canonical event + environment + valid (wind-legal) marks. WA 2025 scoring already exists.
Grouping/comparison is currently fragile because of the name variants above.
- [ ] Define ranking rules (per event, environment, season; division filters).

## 6. Head-to-head
Compare two athletes — including "same meet / same race" head-to-head (did they actually race each
other), which needs reliable `meet_id` + event linkage (a concrete reason the meet_id work matters).
- [ ] Define head-to-head logic (overall PR compare vs. same-race results).

## 7. Progression charts
Athlete performance over time, per event/environment.
- [ ] Define progression (per canonical event, chronological, environment-separated).

## 8. (reserved — more to add)
The builder has more logic to recall; append here as it comes up.
