-- TFRRS appends age, division, and equipment qualifiers to canonical event
-- names. Preserve each source label while resolving it to the existing event
-- type instead of creating a new event identity.
WITH aliases(raw_name, code) AS (
  VALUES
    ('1 Mile Run Scholastic', 'Mile'),
    ('60 Meter Dash Scholastic', '60m'),
    ('1 Mile Run Masters 40-99', 'Mile'),
    ('200 Meter Dash Masters 40-99', '200m'),
    ('60 Meter Dash MASTERS Masters 40-99', '60m'),
    ('60 Meter Hurdles Scholastic', '60m H'),
    ('Weight Throw Scholastic', 'Weight Throw'),
    ('Shot Put Scholastic', 'Shot Put'),
    ('Long Jump Scholastic', 'Long Jump'),
    ('1.0 Mile Race Walk', 'Race Walk'),
    ('800 Meter Run Masters 40-99', '800m'),
    ('400 Meter Dash Masters 40-99', '400m'),
    ('60 Meter Hurdles Masters 70 plus', '60m H'),
    ('30-39 60 Meter Hurdles Age 30-39', '60m H'),
    ('60 Meter Hurdles Masters 50-59', '60m H'),
    ('Shot Put Masters 40-99', 'Shot Put'),
    ('Weight Throw Masters 40-99', 'Weight Throw'),
    ('1500 Meter Run Enroute', '1500m'),
    ('1 Mile Run Junior High School', 'Mile'),
    ('1 Mile Run Masters Masters', 'Mile'),
    ('Javelin Throw 800 gram', 'Javelin'),
    ('Javelin Throw Finnish Jav 450 gram', 'Javelin'),
    ('Javelin Throw Open/Masters 700 gram', 'Javelin')
)
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT a.raw_name, e.event_type_id
  FROM aliases a
  JOIN public.event_types e ON e.code = a.code
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;
