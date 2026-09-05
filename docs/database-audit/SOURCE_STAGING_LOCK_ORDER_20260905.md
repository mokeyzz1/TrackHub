# ING-02e: deterministic source-staging lock order

The real PostgreSQL test reproduced a `40P01` deadlock: two transactions staged the same source
records in opposite input orders. Each acquired one identity's upsert lock and waited on the other.
The canonical promotion advisory locks do not cover this earlier staging phase.

The store now sorts a copy of the entire validated input by provider and source key before making
500-row chunks. JavaScript compares UTF-8 bytes and SQL explicitly uses `COLLATE "C"` on both
columns, so locale or supplementary Unicode cannot change the order. Sorting only inside chunks
would not establish a consistent order across the whole transaction. Caller arrays are not mutated.

Verification: the failing-before PostgreSQL scenario now commits both transactions, with a bounded
synthetic insert delay exposing the race. All 18 PostgreSQL tests pass (17 scenarios plus parent).
Seven store tests include global ordering across 501 records, provider separation, UTF-8 versus
UTF-16 ordering and caller-array preservation. Existing duplicate/provenance validation still
occurs before opening the transaction. This is not a claim that uncoordinated external writers
cannot deadlock; they remain part of the broader writer audit.

No schema, production row or live ingestion run changed. No backup or new table was required.
Rollback is reverting this code checkpoint, which would restore the reproduced deadlock risk.
The Supabase locking guidance informed consistent acquisition order and short transactional scope;
there is no retry loop hiding a transaction-ordering defect.
