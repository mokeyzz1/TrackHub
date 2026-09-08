#!/usr/bin/env bash
set -euo pipefail

# Provision a fresh schema-only fixture. Never consume production connection variables.
task_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ -n "${TRACK_SCHEMA_PG_BIN:-}" ]; then
  task_pg_bin="$TRACK_SCHEMA_PG_BIN"
elif command -v postgres >/dev/null 2>&1; then
  task_pg_bin="$(dirname -- "$(command -v postgres)")"
else
  task_pg_bin="$(pg_config --bindir)"
fi
case "$("$task_pg_bin/postgres" --version)" in
  *' 17.'*) ;;
  *) printf '%s\n' 'PostgreSQL 17 binaries are required.' >&2; exit 1 ;;
esac
task_fixture_root="$(mktemp -d /tmp/track-schema-validation.XXXXXX)"
task_run_as_postgres=false
if [ "$(id -u)" = 0 ]; then
  # Official PostgreSQL CI image runs steps as root; the database server must not.
  chown postgres "$task_fixture_root"
  task_run_as_postgres=true
fi
run_pg() {
  if [ "$task_run_as_postgres" = true ]; then runuser -u postgres -- "$@"; else "$@"; fi
}
cleanup() {
  run_pg "$task_pg_bin/pg_ctl" -D "$task_fixture_root/pgdata" -m fast -w stop >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

run_pg "$task_pg_bin/initdb" -A trust -U postgres -D "$task_fixture_root/pgdata" >/dev/null
run_pg "$task_pg_bin/pg_ctl" -D "$task_fixture_root/pgdata" -l "$task_fixture_root/server.log" \
  -o "-h '' -k $task_fixture_root -p 55434" -w start
"$task_pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$task_fixture_root" -p 55434 -U postgres -d template1 \
  -c 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE supabase_admin;'
"$task_pg_bin/createdb" -h "$task_fixture_root" -p 55434 -U postgres --template=template0 current_owner_schema
# Filtered pg_restore exports omit schema creation/ACL entries; establish only their prerequisites.
"$task_pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$task_fixture_root" -p 55434 -U postgres -d current_owner_schema \
  -c 'CREATE SCHEMA ingest; GRANT USAGE ON SCHEMA ingest TO service_role;'
"$task_pg_bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$task_fixture_root" -p 55434 -U postgres -d current_owner_schema \
  -f "$task_repo_root/docs/database-audit/fixtures/application-schema-pre-checkpoints.sql"
cd "$task_repo_root"
TRACK_SCHEMA_TEST_SOCKET="$task_fixture_root" TRACK_SCHEMA_TEST_TEMPLATE=current_owner_schema npm run test:ingestion-postgres
TRACK_SCHEMA_TEST_SOCKET="$task_fixture_root" node --test docs/database-audit/result_affiliation.integration.test.js
TRACK_SCHEMA_TEST_SOCKET="$task_fixture_root" node --test docs/database-audit/athlete_collegiate_history.integration.test.js
TRACK_SCHEMA_TEST_SOCKET="$task_fixture_root" node --test docs/database-audit/collegiate_roster_evidence.integration.test.js
printf 'Verified isolated fixture retained at %s (server stops on exit).\n' "$task_fixture_root"
