-- Read-only integrity check for the shared external identity map.
-- No rows, links, or policies are changed by this script.

SELECT
  count(*) AS rows,
  count(DISTINCT athlete_id) AS athletes,
  count(*) FILTER (WHERE verified) AS verified_rows,
  count(*) FILTER (WHERE school_id IS NOT NULL) AS school_links,
  count(*) FILTER (WHERE team_id IS NOT NULL) AS team_links,
  count(*) FILTER (WHERE conference_id IS NOT NULL) AS conference_links,
  count(*) FILTER (WHERE external_url IS NULL) AS missing_external_urls
FROM public.external_ids;

SELECT source, external_key, count(*) AS rows
FROM public.external_ids
GROUP BY source, external_key
HAVING count(*) > 1
ORDER BY rows DESC, source, external_key;

SELECT athlete_id, count(*) AS rows,
       string_agg(source || ':' || external_key, ', ' ORDER BY source, external_key) AS identities
FROM public.external_ids
GROUP BY athlete_id
HAVING count(*) > 1
ORDER BY rows DESC, athlete_id;
