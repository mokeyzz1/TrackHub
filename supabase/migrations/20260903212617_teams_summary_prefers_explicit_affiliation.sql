BEGIN;

-- Preserve the existing teams_summary column contract and all current joins.
-- The only semantic change is that a reviewed explicit team_name wins when
-- populated; existing rows have team_name NULL, so their output is unchanged.
CREATE OR REPLACE VIEW public.teams_summary AS
 SELECT t.team_id,
    COALESCE(t.team_name, s.official_name) AS school_name,
    s.division,
    t.gender,
    r.region_name,
    c.name AS conference_name,
    count(ats.athlete_id) AS athlete_count
   FROM ((((public.teams t
     JOIN public.schools s ON ((t.school_id = s.school_id)))
     LEFT JOIN public.regions r ON ((s.region_id = r.region_id)))
     LEFT JOIN public.conferences c ON ((s.current_conference_id = c.conference_id)))
     LEFT JOIN public.athlete_team_seasons ats ON ((t.team_id = ats.team_id)))
  GROUP BY t.team_id, COALESCE(t.team_name, s.official_name), s.division,
    t.gender, r.region_name, c.name;

COMMENT ON VIEW public.teams_summary IS
  'Compatibility summary; school_name prefers reviewed teams.team_name and falls back to schools.official_name.';

COMMIT;
