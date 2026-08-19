-- Sibling-table gaps found 2026-08-19 by asking the DEDUP_METHOD §0 question properly.
--
-- WHY THIS EXISTS. M9 repaired `results.mark_seconds` and I called the class fixed. The owner
-- asked whether the verification really covered the whole database. It did not: `relay_results`
-- and `athlete_prs` held 379,508 rows with the identical defect. Re-asking "where else does this
-- pattern live?" of EVERY invariant — not just the one I had just written — then surfaced two
-- more gaps, both fixed here. Both are cases of a fix landing in `results` and never reaching its
-- siblings, which is the single most repeated mistake in this project.
--
-- Verified before writing: neither change can collide with a unique index.
--   * athlete_prs has no unique index containing mark_raw (only (athlete_id, event_name, season)).
--   * relay_results HAS two unique indexes containing event_type_id, so resolving a NULL event
--     type can collide with a twin the NULL was hiding it from (CLAUDE.md §8). Checked all 48
--     target rows against both index keys: 0 collisions.

BEGIN;

-- 1) M8 never reached athlete_prs -------------------------------------------------------------
-- M8 repaired 21,683 doubled mark codes in `results` on 2026-08-12 and was marked FIXED. The
-- sibling table kept 41 of them: "NH  NH" x22, "NM  NM" x19. The app renders mark_raw verbatim,
-- so these reach the user. NM/NH are legitimate results (the athlete took their attempts and none
-- counted) — REPAIRED, never deleted, per DEDUP_METHOD §8.
UPDATE athlete_prs
SET mark_raw = (regexp_match(mark_raw, '^(NM|NH|ND|DNS|DNF|DQ|NT)\s+\1$'))[1]
WHERE mark_raw ~ '^(NM|NH|ND|DNS|DNF|DQ|NT)\s+\1$';

-- 2) Four athletic.net relay short codes had no alias -------------------------------------------
-- Relay event coverage was documented as 100%; 48 rows were actually NULL. All four target event
-- types already existed — only the aliases were missing, in the same family as the athletic.net
-- short codes already mapped (60mh, weight, 1mile).
--   sprintmed2248 -> SMR. The digits are the leg distances: 200/200/400/800.
--   110shuttleh   -> Shuttle Hurdle Relay (110m version; the 100m one is already aliased).
--   4x1600m       -> 4x1600m, which exists (CLAUDE.md: "4x Mile -> 4x1600m").
--   4x300m        -> 4x300m. NOTE the alias already existed, so these 9 rows were written by a
--                    path that did not run the resolver at all — they predate the wiring.
INSERT INTO event_aliases (raw_name, event_type_id) VALUES
  ('sprintmed2248', 60),
  ('110shuttleh',   59),
  ('4x1600m',       32)
ON CONFLICT (raw_name) DO NOTHING;

UPDATE relay_results rr
SET event_type_id = a.event_type_id
FROM event_aliases a
WHERE rr.event_type_id IS NULL
  AND lower(btrim(rr.event_name)) = lower(btrim(a.raw_name));

COMMIT;
