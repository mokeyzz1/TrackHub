# `public.events` retirement evidence — 2026-09-03

## Live database evidence

- Row count: **0**.
- Database dependents: **none** (no live view/rule dependency).
- Foreign key: `events.meet_id → meets.meet_id ON DELETE CASCADE`.
- Constraints: primary key plus checks for `gender` and `status`.
- Indexes: primary key, `meet_id`, and `status` indexes.
- Policy: one public read policy for `anon` and `authenticated`; no write policy.

The table is structurally valid, but it is an empty scheduling model rather than a source of
canonical performance facts. Results use `event_type_id` and do not depend on rows in `events`.

## Application evidence

The only production application reader is `frontend/hooks/useMeetDetails.ts`. It selects all event
columns for a meet and currently returns an empty array for every meet. The repository’s prior dead-
table migration explicitly deferred dropping `events` until this fetch is removed; a repository-wide
search found no other live `.from('events')` reader or writer.

## Safe disposition

`events` is assigned **retire after frontend reader migration**:

1. Change `useMeetDetails` to return `events: []` (or remove the field after checking UI consumers).
2. Run frontend type/tests and a repository-wide search proving no reader remains.
3. Re-run this evidence query and confirm the table is still empty and has no new dependents.
4. Drop the table and its sequence in a separate migration with a rollback script that recreates the
   exact structure if needed.

No table, row, policy, or constraint was changed by this evidence packet. The retirement is not
authorized until the frontend migration and rollback test are complete.
