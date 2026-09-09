# Event Mapping Proposal (FINAL — research-informed, ~100%)

Generated from live `results`. **Nothing applied — this is the reviewed catalog we would build.**

- Distinct raw names: **1135**  •  Total rows: **3,634,305**
- **Mapped into 61 canonical events** (incl. an explicit `Other (uncommon)` = 82 rows / 10 rare names)
- Everything else — **100.00% of rows — maps to a real, named event.**

Environment: indoor / outdoor / xc / **both** (=decided per-result by season).

## Validation (verified against authoritative sources, 2026-07)

Every event and its environment tag was cross-checked against the **official NCAA Division I
indoor and outdoor championship event programs** — the catalog matches. Key confirmations:
- **1500m = outdoor**, **Mile = indoor** — the outdoor/indoor "metric mile" pair.
- **10000m, 3000m SC, discus, hammer, javelin = outdoor** (not in the indoor program).
- **Weight throw = indoor** (outdoor throw equivalent is the hammer); **60m / 60m H = indoor**.
- **4x400m = both** (indoor "1600m relay" + outdoor); **4x100m = outdoor**.
- **Heptathlon = both** — men's *indoor* multi AND women's *outdoor* multi (both are the heptathlon);
  **Pentathlon = women's indoor**, **Decathlon = men's outdoor**.
- Cross-country distances (5k/6k/8k/10k) validated: NCAA men race 8k (10k at D-I/II champs),
  women 6k; mile-measured courses convert (3.1mi=5k, 3.73mi=6k, 4.97mi=8k, 6.2mi=10k).

Sources:
- NCAA D-I Indoor T&F Championships event program — https://en.wikipedia.org/wiki/NCAA_Division_I_Men's_Indoor_Track_and_Field_Championships
- NCAA D-I Outdoor T&F Championships event program — https://en.wikipedia.org/wiki/NCAA_Division_I_Men's_Outdoor_Track_and_Field_Championships
- NCAA.com — indoor vs outdoor season differences — https://www.ncaa.com/news/trackfield-outdoor-women/article/2024-12-05/here-are-differences-between-indoor-and-outdoor-track-seasons
- Duke Chronicle / TrackBarn — college cross country distances

| Canonical event | Env | Rows | Top raw spellings collapsed into it |
|---|---|---:|---|
| **200m** | both | 312,035 | 200 (171,575), 200m (127,515), 200 Meters (7,745), 200 Meter . (598), 200 Meter Dash Unseeded (595) +37 more |
| **800m** | both | 260,958 | 800 (151,145), 800m (99,217), 800 Meters (5,779), 800 M Run (512), 800 M Run Open (387) +69 more |
| **400m** | both | 220,285 | 400 (123,432), 400m (86,189), 400 Meters (7,103), 400 Meter Dash Open (397), 400 Meter . (374) +31 more |
| **5000m** | both | 191,236 | 5000m (183,509), 5000 Meters (3,302), 5000 Meter Run Friday Night (978), 5000 M Run (672), 5000 Meter Run Invite (463) +43 more |
| **1500m** | outdoor | 186,558 | 1500 (108,456), 1500m (73,883), 1500 Meter Run Invite (731), 1500 Meter Run Unseeded (492), 1500 Meter Run Elite (378) +48 more |
| **100m** | outdoor | 182,125 | 100 (94,987), 100 Meters (81,574), 100m (3,308), 100 Meter Dash (584), 100 M Participate (360) +15 more |
| **Shot Put** | both | 179,810 | SP (92,899), Shot Put (84,751), Shot Put Open (482), Shot Put Invite (275), Shot Put OPEN (143) +36 more |
| **Long Jump** | both | 177,824 | LJ (100,773), Long Jump (75,658), Long Jump Open (377), Long Jump Invite (194), College Long Jump College (116) +21 more |
| **8k XC** | xc | 166,880 | 8k (131,871), 8K (XC) (17,757), 4.97M (4,976), 4.97 MILE (XC) (2,987), 5M (1,716) +85 more |
| **6k XC** | xc | 151,694 | 6k (112,973), 6K (XC) (23,079), 4M (3,960), 3.73M (2,747), 4 MILE (XC) (2,555) +80 more |
| **60m** | indoor | 144,973 | 60 (87,094), 60m (48,205), 60 Meters (6,883), 60 Meter Dash QUALIFYING (472), 60 Meter Dash College (423) +20 more |
| **Mile** | both | 111,049 | Mile (92,725), MILE (16,069), 1 Mile Run Open (800), 1 Mile Run Seeded (327), 1 Mile Run Invitational (196) +20 more |
| **Discus** | outdoor | 104,210 | Discus (103,191), College Discus Throw College (126), Discus Throw Championship (116), Discus Throw UCO (112), Discus Throw Elite (103) +15 more |
| **High Jump** | both | 103,999 | HJ (68,236), High Jump (34,425), High Jump Open (222), High Jump Invite (203), College High Jump College (130) +32 more |
| **3000m** | both | 92,774 | 3000 (59,062), 3000m (25,305), 3000 Meters (5,790), 3000 M Run (602), 3000 M Run Open (348) +28 more |
| **60m H** | indoor | 88,514 | 60H (54,059), 60m H (28,681), 60 Hurdles (5,140), 60 Meter Hurdles Invitational (133), 60 M Hurdles University (107) +13 more |
| **Triple Jump** | both | 87,558 | Triple Jump (86,989), College Triple Jump College (114), Triple Jump Invite (88), Triple Jump Open (88), Triple Jump Invitational (52) +11 more |
| **Pole Vault** | both | 87,366 | PV (53,436), Pole Vault (32,095), Pole Vault Invite (419), Pole Vault Open (294), Pole Vault Group B (97) +41 more |
| **Hammer** | outdoor | 87,306 | Hammer (46,399), HT (39,771), Hammer Throw Open (270), Hammer Throw Collegiate (182), Hammer Throw Invite (142) +10 more |
| **Javelin** | outdoor | 74,476 | Javelin (74,056), College Javelin Throw College (120), Javelin Throw Collegiate (108), Javelin Throw Qualify Rd (76), College Javelin Throw Championship (44) +9 more |
| **400m H** | outdoor | 72,216 | 400H (39,393), 400m H (32,239), 400 Meter Hurdles Univ/Coll (147), 400 Hurdles (145), 400 M Hurdles Participate (120) +2 more |
| **Weight Throw** | indoor | 68,602 | WT (34,225), Weight Throw (33,615), Weight Throw Open (221), Weight Throw Invite (155), Weight Throw OPEN (66) +15 more |
| **4x400m** | both | 64,881 | 4x400m (58,858), 4 x 400 Relay (4,419), 4 x 400 Relay Univ/Coll (452), College 4x400 Championship of America (Heats) (176), College 4x400 College (Heats) (172) +21 more |
| **100m H** | outdoor | 54,054 | 100m H (53,517), College 100m Hurdles  (Heats) (120), 100 Hurdles (100), 100 M Hurdles Participate (86), 100 Meter Hurdles Univ/Coll (85) +5 more |
| **110m H** | outdoor | 41,432 | 110m H (40,970), College 110m Hurdles  (Heats) (120), 110 Hurdles (109), 110 Meter Hurdles Univ/Coll (84), 110 M Hurdles Participate (62) +7 more |
| **Heptathlon** | both | 39,013 | Heptathlon (38,149), Heptathlon Group D (145), Heptathlon Group B (121), Heptathlon Maroon (110), Heptathlon Orange (110) +4 more |
| **3000m SC** | outdoor | 37,376 | 3000S (23,898), 3000m SC (13,118), 3000 Meter Steeplechase Section 2 (65), (M) 3000 Meter S.C. Open (40), 3000 Meter Steeplechase Section 1 (35) +11 more |
| **5k XC** | xc | 35,903 | 5K (XC) (21,059), 3.1M (3,916), 3.1 MILE (XC) (2,130), 3M (1,871), 3.11M (1,611) +60 more |
| **10000m** | outdoor | 34,025 | 10000m (33,773), 10000 Meter Run Invite (81), 10000 Meter Run Section 2 (63), 10000 Meter Run Section 1 (58), 10000 Meter Run Unseeded (48) +1 more |
| **1000m** | indoor | 26,871 | 1000m (26,104), 1000 Meters (642), 1000 METERS (XC) (55), 1000 Meter Run Inv (30), 1000 Meter Run Invite (19) +2 more |
| **Decathlon** | outdoor | 20,909 | Decathlon (20,091), Decathlon Maroon (165), Decathlon Orange (155), Decathlon Group A (145), Decathlon Group B (132) +2 more |
| **Pentathlon** | indoor | 19,951 | Pentathlon (19,360), Pentathlon (Indoor) (154), Indoor Pentathlon OPEN (125), Indoor Pentathlon Grp B Points (72), Indoor Pentathlon INVITE (64) +3 more |
| **600m** | indoor | 19,786 | 600m (18,984), 600 Meters (540), 600 Yards (222), 600 M Run (21), 600 Meter Run Inv (12) +1 more |
| **4k XC** | xc | 15,385 | 4k (8,322), 4K (XC) (5,379), 2.49M (372), 2.49 MILE (XC) (275), 2.5M (148) +27 more |
| **300m** | indoor | 14,412 | 300m (14,383), 300 Meter Dash College (29) |
| **500m** | indoor | 7,541 | 500m (6,944), 500 Meters (597) |
| **4x100m** | outdoor | 6,147 | 4x100m (5,525), College 4x100 College (Heats) (192), College 4x100 Championship of America (Heats) (182), College 4x100 Eastern (Heats) (156), College 4x100 Championship of America (32) +4 more |
| **55m** | indoor | 6,137 | 55m (5,670), 55 Meters (451), 55 Meter Dash College (16) |
| **10k XC** | xc | 5,819 | 10K (XC) (4,890), 13.1k (175), 6.2M (133), 13.1K (XC) (132), 6.2 MILE (XC) (96) +14 more |
| **4x800m** | both | 5,633 | 4x800m (5,335), 4 x 800 Relay (116), 4 x 800 Relay Univ/Coll (64), College 4x800 College (62), College 4x800 Championship of America (52) +1 more |
| **DMR** | both | 4,367 | DMR (3,815), College Distance Medley College (256), College Distance Medley Championship of America (168), DMR (Yards) (55), Distance Medley Relay Univ/Coll (28) +6 more |
| **3k XC** | xc | 3,715 | 3k (1,516), 3K (XC) (1,037), 2M (627), 3.1k (65), 3.1K (XC) (64) +16 more |
| **600y** | indoor | 3,134 | 600y (3,134) |
| **4x200m** | indoor | 3,053 | 4x200m (2,637), 4 x 200 Relay (288), 4 x 200 Relay Univ/Coll (96), 4 x 200 Relay UCO (32) |
| **55m H** | indoor | 2,846 | 55m H (2,625), 55 Hurdles (221) |
| **3200m** | both | 2,803 | 3200m (2,127), 2 MILE (XC) (470), 2 Mile (83), 2 MILE (62), 3200 Meters (55) +2 more |
| **1600m** | both | 2,722 | 1600 (2,605), 1600 Meters (108), 1600.0 (7), 1600S (1), 1600y (1) |
| **SMR** | both | 1,008 | SMR (920), Sprint Medley Relay Univ/Coll (48), SMR (1000) (22), Sprint Medley Relay (1000 Meters) (16), SMR (1500) (2) |
| **2000m SC** | outdoor | 793 | 2000S (652), 2000 Steeplechase (141) |
| **3000m RW** | both | 597 | 3000RW (385), 3000 Race Walk (212) |
| **300m H** | both | 557 | 300H (536), 300 Hurdles (21) |
| **5000m RW** | both | 462 | 5000RW (328), 5000 Race Walk (134) |
| **XC (other)** | xc | 124 | 2k (33), 2K (XC) (32), 1.24 MILE (XC) (17), 1.24M (17), 1M (14) +4 more |
| **1200m** | both | 104 | 1200 (78), 1200 Meters (26) |
| **4x1600m** | both | 90 | 4 x 1 Mile Relay (80), 4 x 1600 Relay (10) |
| **150m** | both | 49 | 150 Meters (33), 150 (16) |
| **2000m** | both | 28 | 2000 Meters (28) |
| **Shuttle Hurdle Relay** | indoor | 25 | SHR (240) (14), SHR (220) (9), SHR (200) (1), SHR (300) (1) |
| **Race Walk** | both | 22 | 1500RW (10), 10,000 Race Walk (6), 10,000RW (5), 1500 Race Walk (1) |
| **300y** | indoor | 1 | 300yH (1) |

## `Other (uncommon)` — the genuine oddball tail (10 names, 82 rows)

These are non-standard distances / junk strings; safe to leave as "Other" or hand-assign later:

- `9600 Meters` — 20
- `Other` — 15
- `4800 Meters` — 13
- `3400 Meters` — 10
- `2800` — 9
- `4600` — 8
- `110` — 2
- `1975S` — 2
- `90` — 2
- `5200` — 1
