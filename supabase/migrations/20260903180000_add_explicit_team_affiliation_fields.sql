-- Additive affiliation foundation.
--
-- Teams currently inherit their display identity from schools and require school_id. These nullable
-- fields let a team carry an explicit source-reviewed name/type without changing existing rows,
-- foreign keys, views, or public behavior. Do not backfill or relax school_id in this migration.

BEGIN;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS team_name text,
  ADD COLUMN IF NOT EXISTS team_type text;

COMMENT ON COLUMN public.teams.team_name IS
  'Explicit competition-affiliation label; NULL preserves the legacy school-derived display until reviewed.';

COMMENT ON COLUMN public.teams.team_type IS
  'Reviewed affiliation category: collegiate, club, scholastic, international, open, unattached, or other.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.teams'::regclass
      AND conname = 'teams_team_type_check'
  ) THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_team_type_check
      CHECK (team_type IS NULL OR team_type IN
        ('collegiate', 'club', 'scholastic', 'international', 'open', 'unattached', 'other'));
  END IF;
END
$$;

COMMIT;

-- Intentionally no UPDATE, FK change, policy change, or placeholder retirement here.
