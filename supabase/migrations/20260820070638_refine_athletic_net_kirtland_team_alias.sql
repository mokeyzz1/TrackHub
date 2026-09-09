-- Prefer AthleticLIVE's stable numeric team identity over the display label.

UPDATE ingest.team_aliases
SET source_team_key = '34535',
    normalized_source_team_key = '34535',
    updated_at = now()
WHERE source = 'athletic_net'
  AND normalized_source_team_key = 'kirtland mich cc a'
  AND source_gender = 'M';
