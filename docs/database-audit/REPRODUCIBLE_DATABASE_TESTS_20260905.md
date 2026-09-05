# MIG-01e2 / SEC-01b: repeatable tests and scheduler input safety

`npm run test:database-isolated` now provisions a fresh PostgreSQL 17 cluster, restores the committed
schema-only fixture, runs all 19 PostgreSQL tests, and stops the server on exit. It uses a new private
Unix socket with TCP disabled and explicit local connection arguments. No production URL, password,
private backup file, data copy, or hosted service is required. The new command was run successfully
from scratch on local PostgreSQL 17.11. Failed and successful test clusters remain stopped in private
temporary directories for diagnosis; the tests drop only their own randomly named databases.

The fixture exports `public` and `ingest` definitions from the verified September 5 pre-checkpoint
archive. It contains no COPY data, sequence setval calls or JWT credentials. Filtered exports omit
schema creation/ACL entries, so the bootstrap explicitly supplies roles and private schema USAGE.
Tests apply the reviewed additive migrations to disposable databases and exercise view migrations
and rollback scripts transactionally. This is a regression baseline, **not** an empty-project replay
of every historical migration or a substitute for platform-managed schema validation.

`validate-backend.yml` now configures a PostgreSQL 17.11-bookworm container job and runs schema,
source-evidence, correction and workflow-safety tests in addition to ingestion tests. The image tag
was checked against the [Docker Official Images manifest](https://github.com/docker-library/official-images/blob/master/library/postgres).
Hosted CI has **not** been run: no branch push, remote dispatch, secret change or deployment was
performed. MIG-01e3 remains open. Local Docker is unavailable, so the Linux container/root path is
configured but not claimed as locally executed; the native fresh-cluster path is verified.

## Scheduler review and safe inputs

Three configured GitHub workflows have schedules: meet discovery, result sync and meet-status
updates. This is repository configuration evidence, not proof their remote schedules are enabled.
All use the shared `trackhub-production-writer` concurrency group. Result sync already requires
`INGEST_DATABASE_URL` and `--commit --control-plane`; it does not silently fall back to uncontrolled
result writes. Meet discovery/status updates have distinct metadata-write roles and still need the
broader writer inventory. Live-status metadata checking is not continuous live-result scraping.

Manual days/scope inputs previously appeared directly inside shell scripts. They now flow through
environment variables and quoted arguments, following [GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).
The CLI rejects malformed, absent, nonpositive or unsafe-integer day values instead of partially
parsing strings like `7abc`. No schedule frequency or credential reference was changed.

Verification: 236 ingestion tests, 20 history/coverage tests, three workflow-safety tests, and the
fresh-cluster 19-test PostgreSQL run pass. Workflow tests reject direct manual-input interpolation,
demonstrate shell-looking input stays literal, and check fixture/CI wiring. These do not claim to
replace a hosted Actions run. Changes are code/configuration only; no production schema or data
changed in this checkpoint. Rollback is reverting these scoped files, retaining existing backups.
