-- Read-only configuration inventory. Deliberately omit sourcefile and raw role config values.
-- Whitelisted values describe this audit session, not every application connection.
SELECT jsonb_build_object(
  'settings', (SELECT jsonb_agg(jsonb_build_object(
    'name', name, 'category', category, 'description', short_desc,
    'context', context, 'type', vartype, 'unit', unit, 'source', source,
    'pending_restart', pending_restart,
    'value_hex', CASE WHEN name = ANY(ARRAY[
      'default_transaction_isolation','default_transaction_read_only','server_version',
      'standard_conforming_strings','row_security','statement_timeout','lock_timeout',
      'idle_in_transaction_session_timeout','transaction_timeout','max_connections',
      'max_locks_per_transaction','max_prepared_transactions','shared_buffers',
      'effective_cache_size','work_mem','maintenance_work_mem','wal_level',
      'max_replication_slots','max_wal_senders','search_path','TimeZone'
    ]) THEN encode(convert_to(setting, 'UTF8'), 'hex') ELSE NULL END,
    'value_redacted', NOT(name = ANY(ARRAY[
      'default_transaction_isolation','default_transaction_read_only','server_version',
      'standard_conforming_strings','row_security','statement_timeout','lock_timeout',
      'idle_in_transaction_session_timeout','transaction_timeout','max_connections',
      'max_locks_per_transaction','max_prepared_transactions','shared_buffers',
      'effective_cache_size','work_mem','maintenance_work_mem','wal_level',
      'max_replication_slots','max_wal_senders','search_path','TimeZone'
    ]))
  ) ORDER BY name) FROM pg_settings),
  'override_scopes', (SELECT jsonb_agg(jsonb_build_object(
    'database', coalesce(d.datname, '<all>'), 'role', coalesce(r.rolname, '<all>'),
    'setting_names', ARRAY(SELECT split_part(v, '=', 1) FROM unnest(s.setconfig) v ORDER BY 1),
    'values_redacted', true
  ) ORDER BY s.setdatabase,s.setrole)
  FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase
  LEFT JOIN pg_roles r ON r.oid=s.setrole)
) AS catalog;
