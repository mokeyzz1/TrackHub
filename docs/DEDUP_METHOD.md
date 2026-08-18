# How to clean data in this database without destroying it

Written 2026-08-12, after a session that removed 477,503 rows and **nearly destroyed roughly as
many real ones**. Every rule below cost something to learn. Read it before writing another
cleanup script.

The headline: in that session, verification caught more damage than the rules prevented. The rules
were wrong about as often as they were right. **The process is what worked, not the judgement.**

---

## 0. Fix the CLASS, not the instance — ask these three before closing anything

Owner, 2026-08-18: *"why didn't all that get fixed at the same time?"* Because each fix was
scoped to the symptom in front of me. Three times in one session:

| fixed | never asked | cost |
|---|---|---|
| the colon parser (F7) | *does existing data still carry this bug?* | 463 meets stayed broken for months, reported 3× |
| DUP-2 in `results` | *does the sibling table have this pattern?* | ~13,000 relay Heat+Finals duplicates untouched |
| found the leg-name format split | *does this invalidate a dedup I already ran?* | DUP-3 missed ~26,000 rows |

**Before marking anything fixed, answer all three:**

1. **Is the DATA fixed, or only the code?** A parser fix repairs future scrapes and nothing else.
   Two separate lines, and the second is not done until it is measured.
2. **Where else does this pattern live?** `results` ↔ `relay_results` ↔ athlete-history rows are
   siblings. A bug in one is a hypothesis about the others.
3. **Does this invalidate an earlier measurement or fix?** New understanding of the data usually
   means an earlier key was wrong, not just incomplete.

The one time this went right was U8 — the collapse fix landed in **both** scrapers because
`U1 (two engines, copy-pasted logic)` was written down. When the sibling is documented it gets
checked; when it isn't, it doesn't. So write the sibling down.

## 1. Re-measure. The tracker lies.

Three documented issue sizes were materially wrong when checked:

| issue | documented | actual |
|---|---|---|
| DUP-3 relay duplicates | 43,037 | **674** (98% overstated) |
| M1 timeless relay events | "619 meets" | 212 events / 157 meets |
| DUP-2 round duplicates | 416,044 | 453,113 (**under**stated) |

Numbers age, scopes drift, and earlier measurements were sometimes taken with a key that turned
out to be invalid. **Never act on a number you did not just measure** — including one you wrote
yourself last week.

## 2. Ask the schema what points at the row — do not rely on memory

Before any DELETE:

```sql
SELECT tc.table_name, kcu.column_name, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = '<target>';
```

This trap appeared **three times in one day**, each time in a different guise:

- `relay_athletes` → `relay_results` is **CASCADE**. Deleting a relay silently deletes its legs.
- `athlete_team_seasons` → `athletes` is **CASCADE**. Would have wiped roster history for 2,792
  athletes.
- `athlete_prs` → `athletes` is NO ACTION, which *saved* us — it would have raised an error. 189
  of those career bests cannot be reproduced from `results`.

`NO ACTION` protects you loudly. `CASCADE` destroys quietly. Know which you have.

## 3. Identity must come from something that identifies

The single most expensive mistake of the session: deduping relays on
`(meet, event, team, place, mark, round)`. A school enters A/B/C/D squads; when they all scratch,
all four rows read `mark='DNS'`, `place=NULL`. **Identical on every column, four different teams.**

That key would have deleted 29,184 rows, and **93% of the 37,561 cascading legs named an athlete
who was not in the surviving row.**

- A **status code is not an identifier.** `DNS`/`DNF`/`NT`/`DQ` say what happened, not who.
- A **NULL place is not an identifier.**
- For relays, identity is the **lineup**. For individuals, the **athlete**.
- If a row has no lineup, you cannot prove it is the same squad. Leave it.

## 4. Prove the survivor holds the data — do not infer it structurally

DUP-1 attribution failed **four times**, each rule plausible and each wrong:

| rule | what it produced |
|---|---|
| largest same-date meet is the original | named Southland — a real, unrelated championship — as owner of Big Ten results |
| largest link-backed meet within ±3 days | named a meet containing **0 of the 851 rows** |
| container derived from the data | correct at last, but exposed mutual pairs where deleting both erases everything |
| keep the biggest in the cluster | coin flip — mutual copies have identical row counts |

What finally worked was **evidence**: the real meet's host state (`meets.location`) appears among
its own schools' states; the copy's does not. Jim Duncan Invitational is in Des Moines with
IA/NE/SD schools; Jim Linthicum holds the same schools but sits in Cupertino.

**Corollaries:**
- Size is not evidence. Date is not evidence. Row counts are not evidence.
- A copy is only deletable if its rows survive at a meet that is **not itself condemned** —
  otherwise mutual pairs annihilate each other.
- **Pass the FULL condemned list even when applying a subset.** Splitting a run into batches once
  made a known-bad meet look like a legitimate survivor to the second batch.

## 5. Write the ids down BEFORE you write

The one unrecoverable process failure: a backfill updated 3,271 rows without saving their ids.
Afterwards those rows were indistinguishable from normally-written ones, so it became impossible
to answer "did this create duplicates?" or to roll back just those rows.

- **UPDATE** → dump the id list to JSON first.
- **DELETE** → copy **whole rows** to a backup table; an id list cannot undo a delete. Children
  before parents where a cascade exists.
- Record it in `docs/RECOVERY.md`.

## 6. Verify what actually remains, not what the script reported

Two bugs were caught only this way:

- A DUP-1 run reported success while `Big 12` quietly survived on a tie-break, still holding 1,471
  rows of Big Ten data. The deletion log looked clean; the row counts did not.
- A DUP-2 run left 376 groups behind because of two SQL NULL bugs. Caught because the residual was
  561 when 185 was predicted — **the gap was chased instead of accepted**.

If a number is not what you predicted, find out why before moving on. That habit found both.

## 7. SQL three-valued logic will silently skip rows

Both bugs failed *safely* (skipped rather than over-deleted), but neither announced itself:

- `a.col = b.col` is **not true** when both are NULL. Use `IS NOT DISTINCT FROM` for any nullable
  column — `event_type_id`, `place`, `round` are all nullable here.
- `bool_or(x)` returns NULL when every input is NULL, and `NOT NULL` is NULL, so the group
  **vanishes from `HAVING`**. Wrap aggregate booleans in `COALESCE(..., false)`.

## 8. Prefer repair to deletion

21,692 rows stored `NM  NM` instead of `NM`. They look exactly like corruption. Deleting them
would have erased real competition records — `NM` means the athlete took their attempts and none
counted. They were **repaired**, and the athletes kept their results.

Ask "is this malformed, or is it unfamiliar?" before reaching for DELETE. The relay DNS rows and
the doubled mark codes were both *unfamiliar*, and only one of them was a bug.

## 9. This instance will time out — design for it

- Correlated subqueries over `results` (3.3M rows) time out. Pre-aggregate into temp tables.
- Pairwise self-joins across meets time out. Single-pass keying works.
- `CREATE INDEX CONCURRENTLY` cannot run in a transaction, so it cannot go through the migration
  runner — run it on its own connection and record the file.
- Small throttled batches, PK-driven ranges, reconnect-on-drop.
