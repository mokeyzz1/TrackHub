-- The meets table contains imported IDs above the original sequence value.
-- Reconcile the sequence before any writer uses a default meet_id, otherwise a future insert can
-- collide with an existing imported row. This changes sequence state only; no fact rows move.

SELECT setval(
  'public.meets_meet_id_seq'::regclass,
  GREATEST(COALESCE((SELECT max(meet_id) FROM public.meets), 1), 1),
  true
);
