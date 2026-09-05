# TRACK-02: extend the schema register beyond tables and columns

The master register now has 2,279 entries, adding 554 catalog objects to the existing 1,725.
Read-only `schema_extended_scan.sql` captures defaults/identity definitions, sequence ownership,
effective schema/relation/function ACLs, explicit column ACLs, default privileges, enums, extensions,
publications, event triggers and foreign-server option names. Snapshot: `schema_extended_20260905.json`.
Each new object has a stable register ID, ownership, purpose/review state, evidence and next action.
This is coverage, not blanket semantic/security approval of every newly captured object.

Counts: 243 defaults/identity definitions, 27 sequences, 12 enums, five extensions, 11 schema ACL
sets, 110 relation ACL sets, 114 function ACL sets, 25 default-privilege sets, one publication and six
event triggers. No explicit column ACLs or foreign servers were found. Default privilege sets and
effective object ACLs remain distinct; they govern future and existing objects respectively.

No `pg_cron` extension or `cron.job` relation exists. That rules out this PostgreSQL scheduler only,
not GitHub Actions, host jobs, Edge Function triggers or external automation. Their inventory remains
open. Database settings and additional type/dependency classes also remain open; do not overstate
the scope of this scan. Managed platform objects are cataloged, not casually altered.

## Sequence verification: no repair needed

Read all 25 application-owned sequence states directly, including `is_called`, and compared with
the maximum stored ID in each owned column. Every next allocation exceeds the stored maximum and
is within the sequence bound. No `nextval`, reset or sequence mutation was issued. The two managed
sequences remain platform-owned review entries. `sequence_state_20260905.json` preserves the checks.
`pg_sequences.last_value=NULL` does not itself prove drift: regions is at 101, not yet called, after
stored ID 100. Empty conference membership also safely retains its initial uncalled sequence.
Gaps after failed inserts or deleted rows are legitimate; never rewind sequences to fill them.

## Safety and tests

Sequence bounds/values are exported as decimal strings to preserve bigint precision through JSON.
No user records or decrypted secrets were read. Sensitive-column default expressions are redacted;
foreign-server option values are not exported. Redacted defaults remain explicit private-review work.
Tests prove 554 unique extended IDs, 25 verified sequence checks, exact bigint bounds, redaction and
merged master coverage. Existing semantic review states are preserved when extending the register.

No live data or schema changed; no migration was created. Rollback is removing this read-only
inventory checkpoint if necessary, not changing the database. The team summary's full live plan was
also measured after its separate checkpoint: 3,516 rows in 600.271 ms (one observation, not a latency
guarantee). No index was added from that measurement alone.
