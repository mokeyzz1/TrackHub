# Restore verification — 2026-09-02

## Outcome

The owner-managed database backup is restore-tested, not merely readable. The PostgreSQL custom
archive was restored with `--exit-on-error` into a new, isolated PostgreSQL 17 database on local
port 55432. The live Supabase database was not used as a restore target and was not changed.

The restored test database is stored locally under the ignored baseline directory at:

`/Users/mk/Projects/track-meet-tracker/.db-baselines/20260902/restore-test-pg17/`

The test server was stopped after validation. The restored copy remains available locally for
further read-only inspection.

## Data verification

The exact all-column scan was rerun against the restored database. Its output is byte-for-byte
identical to the scan captured from the live database:

```text
ae740872c352b568da80f3d5aad57c12217072e34bfe614976b93b2552e6cab5  column_profile.tsv
ae740872c352b568da80f3d5aad57c12217072e34bfe614976b93b2552e6cab5  restored-column-profile.tsv
```

That comparison covers 577 application-owned columns and verifies, for every column, the restored
table row total, NULL count, and empty-string count. High-volume restored totals include:

| Relation | Restored rows |
|---|---:|
| `public.results` | 3,507,218 |
| `public.relay_results` | 203,826 |
| `public.relay_athletes` | 462,728 |
| `public.athlete_prs` | 475,527 |
| `public.results_d2_backup` | 453,737 |
| `public.relay_results_d3_backup` | 40,935 |
| `public.relay_athletes_d3_backup` | 89,085 |

The saved integrity scan also completed on the restored copy. It reproduced the expected zero
duplicate canonical result keys, zero duplicate numeric relay keys, zero missing numeric values
for parseable marks, and the same ten result/meet date-review candidates.

## Structure and security verification

The successful restore recreated:

| Object | Count |
|---|---:|
| Tables (`public`, `ingest`, `supabase_migrations`) | 41 |
| Columns | 577 |
| Indexes | 135 |
| Primary keys | 32 |
| Foreign keys | 51 |
| Unvalidated constraints | 0 |
| Views | 4 |
| Functions | 17 |
| RLS policies | 23 |
| RLS-enabled tables | 39 of 40 application tables |

The only application table without RLS is the already-documented, service-role-only
`public.results_athlete_merge_backup` archive. PostgreSQL `pg_amcheck` completed successfully with
parent/child B-tree checks, heap-to-index coverage, and unique-index verification; it reported no
physical table or index corruption.

## Archive integrity and Supabase-managed scope

The archive hashes remained unchanged after the restore test:

```text
4cf900535e1558928926ef9a0855d0cfb89e45e9c178bd5728f6712155ef3de8  owner-schemas.dump
43347b410e323ab224f523b69ee4924be9f5f64294a41ef1b3483568f8f0f7bd  full-database.dump
```

The owner-schema archive has 587 readable restore entries. The full archive has 1,080 readable
entries and additionally captures Supabase-managed schemas and metadata, including `auth`,
`storage`, `realtime`, `extensions`, `vault`, and their event triggers and publication metadata.

The full managed archive was not applied to plain Homebrew PostgreSQL because objects such as the
`supabase_vault` extension and Supabase internal roles require a compatible Supabase platform
environment. This is not an application-data gap: all owner-managed schemas, rows, constraints,
indexes, functions, views, ACLs, RLS settings, and policies were restored and validated. A full
platform-disaster restore should use a compatible Supabase instance and the full archive.

## Local evidence

The ignored baseline directory also contains:

- `restore-test.log` — successful verbose `pg_restore` log
- `restored-column-profile.tsv` — exact restored profile matching the live baseline hash
- `restored-integrity-scan.txt` — restored canonical integrity results
- `restored-object-summary.txt` — restored schema/security object counts
- `restored-amcheck.txt` — empty successful corruption-check output

These files contain database-derived evidence and remain excluded from Git with the backup data.
