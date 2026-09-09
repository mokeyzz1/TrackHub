# Community build plan — accounts, claimed profiles, social

Written 2026-08-12. The owner's next product direction is a **track & field community**: users
sign up, claim their athlete profile, and interact. None of it exists yet.

**Gap this file closes:** every other doc here is about data quality. `SCALING_PLAN.md` says how to
*scale* a social layer but never how to *build* one, and the backend checklist treated "what's
next" as cleanup. This is the product side, and which backend work actually gates it.

---

## What exists today

| | status |
|---|---|
| Auth | **none.** No login screen, no `supabase.auth` anywhere in the app |
| User accounts | **none.** No `users` / `profiles` table |
| Claimed profiles | **none** |
| Feed, follows, reactions | **none** |
| Social scaffolding on `athletes` | columns reserved and empty: `bio`, `profile_image_url`, `hometown`, `high_school`, `grad_year`, `primary_events` |
| Design system | `docs/DESIGN_SYSTEM.md` exists |

So this is a from-scratch build, not an extension.

---

## ⚠️ The one place backend genuinely blocks product

**Claimed profiles are only as good as athlete identity.** When a user taps "this is me", they get
bound to one `athlete_id`. If that person's career is split across several rows, they claim a
fraction of themselves and the app looks broken to the person best placed to notice.

Two open items cause exactly that:

**U2 — Unattached is modelled per-person, not per-competition.** Today `athletes.school_id = 1835`
makes a person's unattached results a *separate athlete* from their college results. A post-collegiate
athlete — precisely the group most likely to sign up — would claim one and lose the other.
**47,186 athletes and 50,543 results sit on that Unattached school id.**

**DUP-4 tail — the real merges.** e.g. Obiora Okeke has a main record with 124 results and an
Unattached record with 3 genuine ones. Whichever he claims, he is missing results.

**Everything else on the backend list does NOT block this.** M5 (`team_id` gaps), M7 (unparsed
marks), DUP-1 pre-2026, the timeless relays — none of them affect whether a person can claim their
own career. Do not let them hold up the community work.

---

## Build order

### 1. Auth
Supabase Auth is already the stack. For an iOS app on the App Store, **Sign in with Apple is
required** if you offer any other third-party sign-in. Email + Apple is the minimum viable set.
Keep the `users` table separate from `athletes` — a user is an account, an athlete is a competitor,
and most users will never be either an athlete or the same person twice.

### 2. Claimed profiles — the core mechanic
A join between account and athlete, with a verification story. Options, cheapest first:
- self-claim with a soft flag (fast, spoofable)
- claim + school email verification
- claim + manual review for contested profiles

**Do U2 first**, or people will claim half their own career. Expect contested claims on common
names — the DUP-4 work is what makes that tractable.

### 3. Profile content
This is what the empty `athletes` columns were reserved for: `bio`, `profile_image_url`,
`hometown`, `high_school`, `grad_year`. A claimed profile should be able to write them; an
unclaimed one keeps the scraped values.

### 4. Social layer
Follows, a feed, reactions. `SCALING_PLAN.md` §5 already has the rules that matter:
keyset pagination (never `OFFSET`), denormalized counters (never `COUNT(*)` per render), indexed
RLS policies, and an index on every FK used in a feed.

### 5. UI/UX
Not something to spec here — it needs taste and your judgement about the audience, and
`DESIGN_SYSTEM.md` is the place for it. Two structural notes that do belong:
- **U5 (frontend migration) makes the data correct, not prettier.** Both matter, and they are
  independent work. A beautiful screen showing an athlete's event six times is still broken.
- **U4 first** — the home screen leaderboard still uses hand-written regex and guesses indoor by
  "has a 60m event". It is the most-seen surface in the app and the smallest fix on the list.

---

## Honest sequencing

The community build does **not** have to wait for the backend. The only true prerequisite is
**U2 + the DUP-4 merges**, because they break claimed profiles specifically. Auth, the accounts
table, and the UI work can start immediately and in parallel.

What the season deadline (Dec/Jan) actually constrains is the *scraper* work — U1, link capture,
the Q/q schema. That is a separate track from the community build and they do not compete for the
same code.
