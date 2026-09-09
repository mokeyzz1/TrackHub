-- Read-only resolution check for public.unmapped_events.
-- The canonical mapping remains public.event_aliases; this query does not write or delete rows.

SELECT
  u.raw_name,
  u.seen_count,
  u.first_seen,
  ea.event_type_id,
  et.code AS canonical_event_code,
  et.category,
  et.measure,
  CASE WHEN ea.raw_name IS NULL THEN 'unresolved' ELSE 'resolved_by_alias' END AS resolution
FROM public.unmapped_events AS u
LEFT JOIN public.event_aliases AS ea
  ON ea.raw_name = u.raw_name
LEFT JOIN public.event_types AS et
  ON et.event_type_id = ea.event_type_id
ORDER BY u.seen_count DESC, u.raw_name;

SELECT
  count(*) AS telemetry_labels,
  coalesce(sum(u.seen_count), 0) AS telemetry_occurrences,
  count(*) FILTER (WHERE ea.raw_name IS NOT NULL) AS exact_alias_matches,
  count(*) FILTER (WHERE ea.raw_name IS NULL) AS unresolved_labels,
  coalesce(sum(u.seen_count) FILTER (WHERE ea.raw_name IS NULL), 0) AS unresolved_occurrences
FROM public.unmapped_events AS u
LEFT JOIN public.event_aliases AS ea
  ON ea.raw_name = u.raw_name;
