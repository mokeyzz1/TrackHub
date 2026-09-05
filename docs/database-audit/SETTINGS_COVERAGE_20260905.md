# Configuration coverage, without secret export

Captured all 478 entries visible in `pg_settings` and nine persistent database/role override
scopes from `pg_db_role_setting`. Added 487 individually addressable register entries, bringing
the object register to 2,766. Existing object review states were preserved. All new settings
remain captured, not semantically approved or performance-tuned.

`settings_catalog_scan.sql` exports metadata and only 21 allowlisted non-secret values. It
omits sourcefile paths and redacts other values. Allowed values use UTF-8 hex during transport
before decoding into the saved JSON, avoiding accidental interpretation of escaped strings.
Override scopes contain setting names only, never their values. Missing provider descriptions
are explicit unanswered review items. Coverage/redaction tests pass within the 24-test history
and register command.

The audit session reports read-committed isolation, row_security=on, UTC, 120-second statement
timeout and PostgreSQL 17.6. This is not every app connection's effective configuration:
anon/authenticated have persistent statement-timeout overrides; authenticator also has lock
timeout and preload settings. Their values remain redacted in this inventory. Do not infer
API timeouts or change global settings from the administrator session's values.

No configuration setting, role membership, table or row was changed. Platform settings need
provider/workload review, not automatic tuning. Custom settings outside these catalogs, hosted
service configuration and transient application SET commands may require separate evidence.
The per-writer explicit isolation fix is already tracked under ING-02f; this inventory does not
replace that contract or certify all defaults safe. Read-only capture needs no data rollback.
