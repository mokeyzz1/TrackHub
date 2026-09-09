# Sacramento City College result-affiliation repair

## Decision and scope

The collegiate-only audit found 18 teamless **individual** results for 12 athletes whose reviewed
TFRRS roster evidence belongs to Sacramento City College (`CA_jcollege_m_Sacramento.html`). The
legacy result observation had resolved the ambiguous source label `Sacramento` to Sacramento State
(`team_id=494`), while the athlete school and reviewed source-team URL identify Sacramento City
College (`team_id=4066`, school `2107`).

The repair changed only `public.results.team_id` for the exact 18 result IDs in
`sacramento_city_college_result_repair_20260909.json`, from NULL to `4066`. All 18 source records
are linked to their same canonical result, are TFRRS individual observations for source meet
`93081`/canonical meet `11778`, and carry the reviewed athlete identities. No relay parent, relay
leg, athlete, meet, source record, source link or observation row was changed. The observation's
historical `target_team_id=494` remains untouched; it is evidence of the old resolver output, not
rewritten history.

The legacy observations have no immutable version hash. This is therefore an explicit
source-backed **affiliation** repair using the reviewed roster/team URL and exact source-linked
athlete identities; it is not a source-payload correction or a reconstruction of the original
payload. The immutable-evidence rule remains in force for future payload corrections.

## Safety and verification

- Before-images for all 18 result rows were inserted into the existing private
  `ingest.fact_cleanup_archive` under operation
  `20260909_sacramento_city_college_result_affiliation_v1`.
- The repair script defaults to a rollback rehearsal and requires `--commit` for the live change.
- Exact preconditions required all rows to be teamless, in meet `11778`, individual facts, and
  linked to the expected TFRRS source records; the target team URL/school and reviewed roster
  membership were asserted.
- The live rollback rehearsal passed for all 18 rows. The committed postconditions show 18/18
  rows on team `4066`, zero remaining teamless rows in this manifest, zero athlete/team-school
  mismatches, 18 archived before-images, and zero relay archive rows.
- Existing result fields and result-row identity are preserved; the unique result guards remain
  in place. An inverse update can be performed only with the archived before-images and an exact
  current-target assertion.

## Remaining hold

This does not close the entire collegiate result-affiliation population. The broader confirmed
cohort still contains teamless results without exact source-team evidence, and the 620 results in
the association-unclassified remainder remain held. Those require new immutable source evidence or
explicit review; no name-only, current-school-only, club or relay inference is authorized.
