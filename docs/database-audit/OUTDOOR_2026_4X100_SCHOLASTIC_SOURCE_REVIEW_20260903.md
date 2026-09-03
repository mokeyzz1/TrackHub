# Outdoor 2026 4x100 scholastic/source-identity review

Date: 2026-09-03  
Scope: `outdoor-2026-4x100-source-reconciliation-v1`  
Status: private review only; no public rows, aliases, or result facts changed.

## Why this packet exists

The private queue still contains 34 `manual_review` actions for 14 source labels from four
mixed TFRRS meets. These labels are not safe varsity-team aliases. Evidence below shows that
most are scholastic high-school programs; Chabot is a community-college program. The database
currently has no matching `public.schools` row for these labels, and `public.teams` has no
club/scholastic discriminator. This packet therefore records identity evidence and a safe
holding decision; it does not propose inserting rows or changing public results.

## Private queue evidence

| Source label | Gender/actions | Meet(s) | Holding classification | Decision |
|---|---:|---|---|---|
| ADM, Adel | F/2, M/1 | 116th Drake Relays | Iowa high school (Adel–De Soto–Minburn) | Hold as scholastic; do not map to a varsity college |
| Ankeny Centennial Jags Black | M/1 | 116th Drake Relays | Ankeny Centennial HS relay squad | Hold as a relay-squad label; do not create a separate school |
| Ankeny Centennial Jags Silve | M/1 | 116th Drake Relays | Ankeny Centennial HS relay squad (truncated “Silver”) | Hold as a relay-squad label; do not create a separate school |
| Bishop Moore | M/2 | Pepsi Florida Relays | Bishop Moore Catholic High School | Hold as scholastic |
| Bullis | F/2 | Pepsi Florida Relays | Bullis School high-school program | Hold as scholastic |
| Centennial | F/1, M/2 | Pepsi Florida Relays | Campus ambiguous; multiple high schools use this label | Hold for campus confirmation |
| Chabot | M/2 | Stanford Invitational; Bryan Clay Invitational | Chabot College community-college program | Hold as collegiate non-varsity until canonical school mapping is verified |
| Cocoa | F/2, M/1 | Pepsi Florida Relays | Cocoa High School | Hold as scholastic |
| CR Jefferson | M/2 | 116th Drake Relays | Cedar Rapids Thomas Jefferson High School | Hold as scholastic |
| CR Kennedy | F/1, M/2 | 116th Drake Relays | Cedar Rapids Kennedy High School | Hold as scholastic |
| Creekside | F/2, M/2 | Pepsi Florida Relays | Campus ambiguous; official FL and GA high schools share the label | Hold for campus confirmation |
| Decorah | F/2, M/1 | 116th Drake Relays | Decorah High School, Iowa | Hold as scholastic |
| Dowling Cath | F/1, M/2 | 116th Drake Relays | Dowling Catholic High School, Iowa | Hold as scholastic |
| Flanagan | M/2 | Pepsi Florida Relays | Charles W. Flanagan High School, Florida | Hold as scholastic |

The TFRRS source records are retained privately in the queue. Representative event URLs are:

- Drake women/men: <https://www.tfrrs.org/results/95611/5986974/116th_Drake_Relays/Womens-4-x-100-Relay> and <https://www.tfrrs.org/results/95611/5986975/116th_Drake_Relays/Mens-4-x-100-Relay>
- Drake men (Ankeny relay labels): <https://www.tfrrs.org/results/95611/5986980/116th_Drake_Relays/Mens-4-x-100-Relay>
- Pepsi Florida women/men: <https://www.tfrrs.org/results/95329/6002611/2026_Pepsi_Florida_Relays/Womens-4-x-100-Relay> and <https://www.tfrrs.org/results/95329/6002612/2026_Pepsi_Florida_Relays/Mens-4-x-100-Relay>
- Stanford men (Chabot): <https://www.tfrrs.org/results/95354/5900594/Stanford_Invitational/Mens-4-x-100-Relay>
- Bryan Clay men (Chabot): <https://www.tfrrs.org/results/94628/5952869/2026_Bryan_Clay_Invitational/Mens-4-x-100-Relay>

## Evidence reviewed

### Iowa programs

- [IHSAA 2026 track classifications](https://www.iahsaa.org/classifications/track-field/) lists
  Ankeny Centennial and Cedar Rapids Kennedy as Iowa high-school track programs.
- [Jefferson High School athletics](https://jefferson.crschools.us/student-life/athletics)
  identifies Thomas Jefferson High School in Cedar Rapids and lists track and field among its
  athletics.
- [Cedar Rapids Kennedy track expectations](https://crschools.us/app/uploads/sites/3/2021/08/Cedar_Rapids_Kennedy_Track_Expectations_20212.pdf)
  identifies Kennedy High School's boys/girls track program.
- [Decorah High School](https://decorah.k12.ia.us/school/decorah-high-school/) and its planning
  guide describe the school's 9–12 track-and-field program.
- [Dowling Catholic sports](https://www.dowlingcatholic.org/athletics/sports) lists track and
  field for Dowling Catholic High School; its [girls track site](https://sites.google.com/dowlingcatholic.org/dchs-gtf/home)
  documents the 2026 high-school program.
- [ADM activities](https://www.admschools.org/activities/athletic-offerings/track-field) identifies
  the Adel–De Soto–Minburn school district's track-and-field offering.

### Florida/Maryland programs

- [Bishop Moore Catholic athletics](https://www.bishopmoore.org/athletics/?day=1&month=1&year=2026)
  identifies the official high-school athletics program; its [achievements page](https://bishopmoorecatholichighschool.org/athletics/achievements.cfm)
  includes track-and-field records and 4x100 history.
- [Bullis track and field](https://www.bullis.org/athletics/teams-schedules/track-field) identifies
  the Bullis School boys/girls high-school teams.
- [Cocoa High athletics](https://www.brevardschools.org/o/cohs/page/athletics-general-information)
  identifies Cocoa High School in Florida; the school's [girls track page](https://eghs.brevardschools.org/o/cohs/page/girls-track)
  documents its track program.
- [Charles W. Flanagan High](https://flanagan.browardschools.com/) identifies the Florida public
  high school and its activities/athletics program.
- “Centennial” remains campus-ambiguous. Official examples include [Centennial High School,
  Maryland athletics](https://chs.hcpss.org/athletics), [Centennial High School, Ohio athletics](https://centennialhs.ccsoh.us/athletics),
  and [Centennial High School, Minnesota track and field](https://highschool.isd12.org/athletics-activities-at-chs/athletics/spring-athletics/track-and-field).
  No campus should be selected from the generic TFRRS label alone.
- “Creekside” remains campus-ambiguous. [Creekside High School, Florida athletics](https://www-chs.stjohns.k12.fl.us/athletics/)
  explicitly lists boys/girls track and field, while [Creekside High School, Georgia activities](https://creekside.fultonschools.org/activities)
  identifies a separate high school with athletics. The source record does not contain enough
  campus evidence to choose between them.

### Chabot

- [Chabot College athletics](https://www.chabotcollege.edu/academics/health-kinesiology-athletics/index.php)
  lists men's and women's track and field among its Gladiator teams. This is a college identity,
  not a club or high-school label; it still needs a verified canonical school/team mapping before
  any public promotion.

## Safe next step

Keep all 34 actions in private `manual_review`. For the unambiguous labels, a future promotion
review may map to a verified scholastic or community-college school record only after confirming
the source's campus and the application's intended school model. For “Centennial” and
“Creekside”, require source-level campus evidence first. Do not use a generic name alias, do not
map scholastic teams to college varsity teams, and do not create public rows as a side effect of
this audit.
