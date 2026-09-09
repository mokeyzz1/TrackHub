-- Read-only athlete identity audit for the post-cleanup database state.
-- Run in one psql session. All working tables are temporary.

DROP TABLE IF EXISTS
  _identity_facts, _identity_overlap_pairs, _athlete_merge_map, _athlete_result_actions,
  _athlete_relay_leg_actions;

CREATE TEMP TABLE _identity_facts ON COMMIT PRESERVE ROWS AS
SELECT r.result_id, r.athlete_id, r.meet_id, r.date, r.event_type_id,
       coalesce(r.place, -2147483648) AS place_key,
       CASE
         WHEN lower(coalesce(r.round, '')) LIKE 'final%' THEN 'final'
         WHEN lower(coalesce(r.round, '')) LIKE 'prelim%' THEN 'prelim'
         ELSE lower(coalesce(r.round, ''))
       END AS round_key,
       CASE
         WHEN r.mark_seconds IS NOT NULL THEN 's:' || round(r.mark_seconds::numeric, 5)::text
         WHEN r.mark_meters IS NOT NULL THEN 'm:' || round(r.mark_meters::numeric, 4)::text
         ELSE 'r:' || lower(regexp_replace(coalesce(r.mark_raw, ''), '[ah]$', '', 'i'))
       END AS mark_key
  FROM public.results r
  JOIN public.event_types et USING (event_type_id)
 WHERE r.meet_id IS NOT NULL
   AND r.athlete_id IS NOT NULL
   AND r.mark_raw ~ '[0-9]'
   AND et.category <> 'relay';

CREATE INDEX ON _identity_facts (meet_id, event_type_id, place_key, round_key, mark_key);
CREATE INDEX ON _identity_facts (athlete_id, date, meet_id);

-- A shared numeric non-relay fact under the same normalized name/gender is the project's strongest
-- same-person signal. A same-day appearance at a different meet is a definitive contradiction and
-- moves the pair to manual review.
CREATE TEMP TABLE _identity_overlap_pairs ON COMMIT PRESERVE ROWS AS
SELECT f1.athlete_id AS athlete_a, f2.athlete_id AS athlete_b,
       count(*)::integer AS overlap_rows,
       count(DISTINCT f1.meet_id)::integer AS overlap_meets,
       false AS conflict
  FROM _identity_facts f1
  JOIN _identity_facts f2
    ON f2.meet_id = f1.meet_id
   AND f2.event_type_id = f1.event_type_id
   AND f2.place_key = f1.place_key
   AND f2.round_key = f1.round_key
   AND f2.mark_key = f1.mark_key
   AND f2.athlete_id > f1.athlete_id
  JOIN public.athletes a ON a.athlete_id = f1.athlete_id
  JOIN public.athletes b
    ON b.athlete_id = f2.athlete_id
   AND b.gender IS NOT DISTINCT FROM a.gender
   AND lower(regexp_replace(b.full_name, '[^a-z0-9]+', '', 'gi'))
       = lower(regexp_replace(a.full_name, '[^a-z0-9]+', '', 'gi'))
 GROUP BY f1.athlete_id, f2.athlete_id;

UPDATE _identity_overlap_pairs p
   SET conflict = true
 WHERE EXISTS (
   SELECT 1
     FROM _identity_facts x
     JOIN _identity_facts y
       ON y.athlete_id = p.athlete_b
      AND y.date = x.date
      AND y.meet_id <> x.meet_id
    WHERE x.athlete_id = p.athlete_a
 );

-- Resolve connected high-confidence pairs into one component. The oldest internal ID is only an
-- audit representative here; a write migration must separately choose source-primary fields.
CREATE TEMP TABLE _athlete_merge_map ON COMMIT PRESERVE ROWS AS
WITH RECURSIVE edges AS (
  SELECT athlete_a AS a, athlete_b AS b
    FROM _identity_overlap_pairs WHERE NOT conflict
), nodes AS (
  SELECT a AS node FROM edges UNION SELECT b FROM edges
), reach(root, node) AS (
  SELECT node, node FROM nodes
  UNION
  SELECT r.root, CASE WHEN e.a = r.node THEN e.b ELSE e.a END
    FROM reach r
    JOIN edges e ON e.a = r.node OR e.b = r.node
)
SELECT node AS athlete_id, min(root) AS canonical_athlete_id
  FROM reach GROUP BY node;

CREATE INDEX ON _athlete_merge_map (athlete_id);
CREATE INDEX ON _athlete_merge_map (canonical_athlete_id);

-- Result actions use the same semantic fact definition as the evidence detector. Unlinked athlete
-- history rows are deliberately kept distinct by result_id.
CREATE TEMP TABLE _athlete_result_actions ON COMMIT PRESERVE ROWS AS
WITH component_results AS (
  SELECT r.*,
         m.canonical_athlete_id,
         CASE WHEN r.meet_id IS NULL THEN r.result_id ELSE 0 END AS history_discriminator,
         CASE
           WHEN r.mark_seconds IS NOT NULL THEN 's:' || round(r.mark_seconds::numeric, 5)::text
           WHEN r.mark_meters IS NOT NULL THEN 'm:' || round(r.mark_meters::numeric, 4)::text
           ELSE 'r:' || lower(regexp_replace(coalesce(r.mark_raw, ''), '[ah]$', '', 'i'))
         END AS mark_key,
         CASE
           WHEN lower(coalesce(r.round, '')) LIKE 'final%' THEN 'final'
           WHEN lower(coalesce(r.round, '')) LIKE 'prelim%' THEN 'prelim'
           ELSE lower(coalesce(r.round, ''))
         END AS round_key
    FROM public.results r
    JOIN _athlete_merge_map m USING (athlete_id)
), ranked AS (
  SELECT c.*,
         row_number() OVER (
           PARTITION BY canonical_athlete_id, meet_id, history_discriminator,
                        event_type_id, place, mark_key, round_key
           ORDER BY (athlete_id = canonical_athlete_id) DESC, result_id
         ) AS keep_rank
    FROM component_results c
)
SELECT result_id, athlete_id, canonical_athlete_id,
       CASE
         WHEN athlete_id = canonical_athlete_id THEN 'keep'
         WHEN keep_rank = 1 THEN 'move'
         ELSE 'delete_duplicate'
       END AS action
  FROM ranked;

CREATE TEMP TABLE _athlete_relay_leg_actions ON COMMIT PRESERVE ROWS AS
WITH ranked AS (
  SELECT ra.relay_athlete_id, ra.athlete_id, m.canonical_athlete_id,
         row_number() OVER (
           PARTITION BY m.canonical_athlete_id, ra.relay_result_id, ra.leg_order
           ORDER BY (ra.athlete_id = m.canonical_athlete_id) DESC, ra.relay_athlete_id
         ) AS keep_rank
    FROM public.relay_athletes ra
    JOIN _athlete_merge_map m USING (athlete_id)
)
SELECT relay_athlete_id, athlete_id, canonical_athlete_id,
       CASE
         WHEN athlete_id = canonical_athlete_id THEN 'keep'
         WHEN keep_rank = 1 THEN 'move'
         ELSE 'delete_duplicate'
       END AS action
  FROM ranked;

SELECT count(*) AS candidate_pairs,
       count(*) FILTER (WHERE NOT conflict) AS high_confidence_pairs,
       count(*) FILTER (WHERE conflict) AS held_pairs
  FROM _identity_overlap_pairs;

SELECT count(*) AS mapped_athletes,
       count(DISTINCT canonical_athlete_id) AS people,
       count(*) FILTER (WHERE athlete_id <> canonical_athlete_id) AS duplicate_athletes
  FROM _athlete_merge_map;

SELECT action, count(*) AS result_rows
  FROM _athlete_result_actions
 WHERE athlete_id <> canonical_athlete_id
 GROUP BY action ORDER BY action;

SELECT action, count(*) AS relay_leg_rows
  FROM _athlete_relay_leg_actions
 WHERE athlete_id <> canonical_athlete_id
 GROUP BY action ORDER BY action;

SELECT
  (SELECT count(*) FROM public.athlete_prs r JOIN _athlete_merge_map m USING (athlete_id)
    WHERE m.athlete_id <> m.canonical_athlete_id) AS duplicate_athlete_prs,
  (SELECT count(*) FROM public.athlete_team_seasons r JOIN _athlete_merge_map m USING (athlete_id)
    WHERE m.athlete_id <> m.canonical_athlete_id) AS duplicate_athlete_seasons,
  (SELECT count(*) FROM public.external_ids r JOIN _athlete_merge_map m USING (athlete_id)
    WHERE m.athlete_id <> m.canonical_athlete_id) AS duplicate_athlete_external_ids,
  (SELECT count(*) FROM public.live_results r JOIN _athlete_merge_map m USING (athlete_id)
    WHERE m.athlete_id <> m.canonical_athlete_id) AS duplicate_athlete_live_results,
  (SELECT count(*) FROM ingest.observations r JOIN _athlete_merge_map m
    ON m.athlete_id = r.target_athlete_id
    WHERE m.athlete_id <> m.canonical_athlete_id) AS duplicate_athlete_observations,
  (SELECT count(*) FROM ingest.athlete_aliases r JOIN _athlete_merge_map m
    ON m.athlete_id = r.target_athlete_id
    WHERE m.athlete_id <> m.canonical_athlete_id) AS duplicate_athlete_aliases;

SELECT count(*) FILTER (WHERE a.tfrrs_athlete_id IS NOT NULL) AS tfrrs_ids_to_preserve,
       count(*) FILTER (WHERE a.athletic_net_url IS NOT NULL) AS athletic_net_ids_to_preserve,
       count(*) FILTER (WHERE a.tfrrs_athlete_id IS NOT NULL AND a.athletic_net_url IS NOT NULL)
         AS rows_with_both_sources
  FROM _athlete_merge_map m
  JOIN public.athletes a USING (athlete_id)
 WHERE m.athlete_id <> m.canonical_athlete_id;

WITH pr_groups AS (
  SELECT m.canonical_athlete_id, p.event_name, p.season, count(*) AS rows
    FROM public.athlete_prs p JOIN _athlete_merge_map m USING (athlete_id)
   GROUP BY m.canonical_athlete_id, p.event_name, p.season
  HAVING count(*) > 1
), season_groups AS (
  SELECT m.canonical_athlete_id, s.team_id, s.season_code, count(*) AS rows
    FROM public.athlete_team_seasons s JOIN _athlete_merge_map m USING (athlete_id)
   GROUP BY m.canonical_athlete_id, s.team_id, s.season_code
  HAVING count(*) > 1
)
SELECT (SELECT count(*) FROM pr_groups) AS pr_conflict_groups,
       (SELECT coalesce(sum(rows), 0) FROM pr_groups) AS pr_conflict_rows,
       (SELECT count(*) FROM season_groups) AS season_conflict_groups,
       (SELECT coalesce(sum(rows), 0) FROM season_groups) AS season_conflict_rows;

SELECT a.created_at::date AS created_a, b.created_at::date AS created_b,
       count(*) AS pairs,
       count(*) FILTER (WHERE 1835 IN (a.school_id, b.school_id)) AS includes_unattached
  FROM _identity_overlap_pairs p
  JOIN public.athletes a ON a.athlete_id = p.athlete_a
  JOIN public.athletes b ON b.athlete_id = p.athlete_b
 WHERE NOT p.conflict
 GROUP BY 1, 2 ORDER BY pairs DESC, 1, 2;

SELECT p.*, a.full_name,
       a.school_id AS school_a, sa.official_name AS school_name_a,
       a.tfrrs_athlete_id AS tfrrs_a,
       b.school_id AS school_b, sb.official_name AS school_name_b,
       b.tfrrs_athlete_id AS tfrrs_b
  FROM _identity_overlap_pairs p
  JOIN public.athletes a ON a.athlete_id = p.athlete_a
  JOIN public.athletes b ON b.athlete_id = p.athlete_b
  JOIN public.schools sa ON sa.school_id = a.school_id
  JOIN public.schools sb ON sb.school_id = b.school_id
 WHERE p.conflict
 ORDER BY p.athlete_a;
