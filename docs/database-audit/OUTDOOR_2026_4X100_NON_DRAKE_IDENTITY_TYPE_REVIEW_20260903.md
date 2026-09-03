# Outdoor 2026 4x100 non-Drake identity-type review

Date: 2026-09-03  
Scope: `outdoor-2026-4x100-source-reconciliation-v1`  
Status: private review only; no public rows, aliases, or result facts changed.

## Finding

After isolating the corrected Drake Relays set, 255 unresolved-source actions remain across the
other Outdoor 2026 meets. A lexical/type triage gives a safe order for research, but it is not a
mapping decision: names still require source-level evidence and a canonical school/team model.

| Triage type | Distinct labels | Actions | Examples | Safe interpretation |
|---|---:|---:|---|---|
| Club/open | 30 | 58 | GVSU Track Club, UO Running Club, Garden State TC, AC Training, CALCO Athletics | Non-varsity/open identity; keep separate from college varsity |
| College | 17 | 50 | Clackamas CC, Everett CC, Chabot, UPR Cayey, Waseda University | Collegiate/community-college identity; verify canonical school |
| Country/international | 10 | 16 | Dominican Republic, USA Red/White/Blue/Silver, Brazil, North American | Open or national/international entry; not a school |
| Alumni/unattached | 4 | 5 | Colorado State Alumni, Fisher Alumni, UNAT-Florida Atlantic | Preserve as open/alumni status; do not attach to current varsity |
| Other | 74 | 126 | Florida/Iowa scholastic names, program labels, abbreviated campuses | Requires event/meet context and campus verification |

The categories total 135 labels and 255 actions. “Other” is intentionally not treated as a
school category; it includes both likely scholastic teams and names too ambiguous for automatic
classification.

## Evidence and guardrails

- TFRRS event pages expose the meet section and squad/team text but do not guarantee that a
  generic label identifies one unique campus. For example, the [Pepsi Florida Relays men's
  results](https://www.tfrrs.org/results/95329/m/2026_Pepsi_Florida_Relays) includes college,
  high-school, open, and international entries in separate sections.
- The [Stanford Invitational Chabot source](https://www.tfrrs.org/results/95354/5900594/Stanford_Invitational/Mens-4-x-100-Relay)
  and [Bryan Clay Chabot source](https://www.tfrrs.org/results/94628/5952869/2026_Bryan_Clay_Invitational/Mens-4-x-100-Relay)
  show why a college label should be verified against the school catalog rather than inferred
  from the event URL alone.
- Existing club and scholastic packets remain the evidence-backed source for those labels:
  [club review](OUTDOOR_2026_4X100_CLUB_IDENTITY_REVIEW_20260903.md),
  [explicit club queue](OUTDOOR_2026_4X100_EXPLICIT_CLUB_QUEUE_20260903.md), and
  [Drake scholastic structure](OUTDOOR_2026_4X100_DRAKE_SCHOLASTIC_STRUCTURE_REVIEW_20260903.md).

## Safe next step

Keep all 255 actions in private `manual_review`. Research and promote only one identity family
at a time, with source URL, event section, gender, and canonical campus evidence recorded. Never
turn a lexical suffix such as `CC`, `TC`, `University`, `Alumni`, or `USA` into a public alias by
itself, and do not create a second database table for this triage.
