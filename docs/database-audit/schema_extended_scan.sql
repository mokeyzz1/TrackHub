-- Read-only catalog coverage. No user rows, decrypted secrets, credentials or sequence advances.
SELECT jsonb_build_object(
  'sequences', (SELECT jsonb_agg(jsonb_build_object(
    'schema',s.schemaname,'name',s.sequencename,'type',s.data_type,'start',s.start_value::text,
    'minimum',s.min_value::text,'maximum',s.max_value::text,'increment',s.increment_by::text,'cycle',s.cycle,
    'cache',s.cache_size::text,'last_value',s.last_value::text,'owner',s.sequenceowner,
    'owned_relation',tn.nspname||'.'||t.relname,'owned_column',a.attname))
    FROM pg_sequences s JOIN pg_namespace n ON n.nspname=s.schemaname
    JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=s.sequencename
    LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid
      AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
    LEFT JOIN pg_class t ON t.oid=d.refobjid LEFT JOIN pg_namespace tn ON tn.oid=t.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
    WHERE s.schemaname NOT LIKE 'pg_%' AND s.schemaname<>'information_schema'),
  'defaults', (SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'relation',c.relname,
    'name',a.attname,'identity',a.attidentity,'generated',a.attgenerated,
    'expression',CASE WHEN a.attname ~* '(password|secret|token|credential)' THEN '[redacted sensitive-column default; review privately]'
      ELSE pg_get_expr(d.adbin,d.adrelid) END))
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attnum>0 AND NOT a.attisdropped AND (d.oid IS NOT NULL OR a.attidentity<>'' OR a.attgenerated<>'')
      AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'),
  'schema_grants', (SELECT jsonb_agg(jsonb_build_object('schema',nspname,'name',nspname,
    'owner',pg_get_userbyid(nspowner),'acl',COALESCE(nspacl,acldefault('n',nspowner))::text))
    FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'),
  'relation_grants', (SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,
    'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),
    'acl',COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))::text))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p','v','m','S') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'),
  'column_grants', (SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'relation',c.relname,
    'name',a.attname,'acl',a.attacl::text)) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attacl IS NOT NULL AND a.attnum>0
      AND NOT a.attisdropped AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'),
  'function_grants', (SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,
    'name',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    'owner',pg_get_userbyid(p.proowner),'acl',COALESCE(p.proacl,acldefault('f',p.proowner))::text))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'),
  'default_grants', (SELECT jsonb_agg(jsonb_build_object('schema',COALESCE(n.nspname,'database-wide'),
    'name',pg_get_userbyid(d.defaclrole)||':'||d.defaclobjtype::text,'acl',d.defaclacl::text))
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace),
  'enum_types', (SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,
    'labels',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid)))
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typtype='e'
      AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'),
  'extensions', (SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',e.extname,
    'version',e.extversion,'owner',pg_get_userbyid(e.extowner))) FROM pg_extension e
    JOIN pg_namespace n ON n.oid=e.extnamespace),
  'publications', (SELECT jsonb_agg(jsonb_build_object('schema','database','name',p.pubname,
    'all_tables',p.puballtables,'insert',p.pubinsert,'update',p.pubupdate,'delete',p.pubdelete,
    'truncate',p.pubtruncate,'tables',(SELECT jsonb_agg(t.schemaname||'.'||t.tablename)
       FROM pg_publication_tables t WHERE t.pubname=p.pubname))) FROM pg_publication p),
  'event_triggers', (SELECT jsonb_agg(jsonb_build_object('schema','database','name',evtname,
    'event',evtevent,'enabled',evtenabled,'function',evtfoid::regprocedure::text,'tags',evttags)) FROM pg_event_trigger),
  'foreign_servers', (SELECT jsonb_agg(jsonb_build_object('schema','database','name',srvname,
    'type',srvtype,'version',srvversion,'option_names',(SELECT jsonb_agg(split_part(o,'=',1))
      FROM unnest(srvoptions) o))) FROM pg_foreign_server),
  'scheduler_presence', jsonb_build_object('cron_jobs_relation',to_regclass('cron.job')::text,
    'pg_cron_extension',EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron'))
) AS snapshot;
