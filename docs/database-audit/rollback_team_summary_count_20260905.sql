-- Restore the former counting expression without losing historical affiliations.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE VIEW public.teams_summary WITH (security_invoker=true) AS
SELECT t.team_id,
    COALESCE(t.team_name, s.official_name) AS school_name,
    s.division,
    t.gender,
    r.region_name,
    c.name AS conference_name,
    count(ats.athlete_id) AS athlete_count
   FROM teams t
     JOIN schools s ON t.school_id = s.school_id
     LEFT JOIN regions r ON s.region_id = r.region_id
     LEFT JOIN conferences c ON s.current_conference_id = c.conference_id
     LEFT JOIN athlete_team_seasons ats ON t.team_id = ats.team_id
  GROUP BY t.team_id, (COALESCE(t.team_name, s.official_name)), s.division, t.gender, r.region_name, c.name;
COMMIT;
