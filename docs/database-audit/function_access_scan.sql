-- Read-only application-function and RPC access audit.
-- Run against production with a read-only role. This file intentionally contains no writes.

-- 1. Application-owned routines, execution ACLs, security mode, and pinned search paths.
select
  n.nspname as schema_name,
  p.oid::regprocedure as signature,
  p.prosecdef as security_definer,
  coalesce(p.proacl::text, '<default PUBLIC>') as acl,
  coalesce(array_to_string(p.proconfig, ', '), '<none>') as config,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'ingest', 'archive')
  and p.prokind = 'f'
order by n.nspname, signature;

-- 2. Function bodies for the small set of security-sensitive/public write paths.
select
  n.nspname as schema_name,
  p.oid::regprocedure as signature,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
  ('public', 'register_push_token'),
  ('public', 'detect_timing_platform'),
  ('public', 'get_top_performances'),
  ('public', 'get_weekly_performances'),
  ('public', 'update_updated_at_column'),
  ('ingest', 'clear_recovery_queue_error_on_complete')
)
order by n.nspname, p.oid;

-- 3. Trigger ownership: trigger helpers are not browser RPC write paths.
select
  n.nspname as table_schema,
  c.relname as table_name,
  t.tgname as trigger_name,
  t.tgenabled,
  pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname in ('public', 'ingest', 'archive')
order by n.nspname, c.relname, t.tgname;

-- 4. The anonymous token RPC's target table must remain service-policy-only.
select
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'push_tokens'
order by ordinal_position;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.push_tokens'::regclass
order by conname;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'push_tokens'
order by policyname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'push_tokens'
order by grantee, privilege_type;

select
  count(*)::bigint as row_count,
  count(*) filter (where is_active)::bigint as active_count
from public.push_tokens;
