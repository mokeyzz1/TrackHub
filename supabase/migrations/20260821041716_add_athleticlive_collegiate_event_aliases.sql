-- AthleticLIVE appends division/meeting qualifiers to its canonical event
-- labels. Resolve those labels to the existing event catalog rather than
-- creating duplicate event types.
WITH aliases(raw_name, code) AS (
  VALUES
    ('10000m Collegiate', '10000m'),
    ('110m Hurdles Collegiate', '110m H'),
    ('100m Hurdles Collegiate', '100m H'),
    ('3000m Steeplechase Collegiate', '3000m SC'),
    ('1500m Collegiate', '1500m'),
    ('1 Mile Run Collegiate', 'Mile'),
    ('100m Collegiate', '100m'),
    ('400m Collegiate', '400m'),
    ('800m Collegiate', '800m'),
    ('400m Hurdles Collegiate', '400m H'),
    ('200m Collegiate', '200m'),
    ('5000m Collegiate', '5000m'),
    ('55m Collegiate', '55m'),
    ('55m Hurdles Collegiate', '55m H'),
    ('600m Collegiate', '600m'),
    ('1000m Collegiate', '1000m'),
    ('3000m Collegiate', '3000m'),
    ('Shot Put Collegiate', 'Shot Put'),
    ('Long Jump Collegiate', 'Long Jump'),
    ('Triple Jump Collegiate', 'Triple Jump'),
    ('High Jump Collegiate', 'High Jump'),
    ('Pole Vault Collegiate', 'Pole Vault'),
    ('Javelin Throw Collegiate', 'Javelin'),
    ('Discus Throw Collegiate', 'Discus'),
    ('Discus Throw Invite', 'Discus'),
    ('Discus Throw Open', 'Discus'),
    ('Hammer Throw Collegiate', 'Hammer'),
    ('Hammer Throw Invite', 'Hammer'),
    ('Hammer Throw Open', 'Hammer'),
    ('4x100m Relay Collegiate', '4x100m'),
    ('4x200m Relay Collegiate', '4x200m'),
    ('4x400m Relay Collegiate', '4x400m'),
    ('4000m Distance Medley Collegiate', 'DMR')
)
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT a.raw_name, e.event_type_id
  FROM aliases a
  JOIN public.event_types e ON e.code = a.code
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;
