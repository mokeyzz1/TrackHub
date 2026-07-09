# Next Build Cleanup Plan

This document captures the cleanup work to do before sending the next TrackHub build. The current live app is already deployed, so local frontend changes do not affect current users until a new App Store/TestFlight build or Expo update is intentionally shipped.

## Guiding Idea

Keep the current live app stable, clean up the local app, protect unfinished features, and ship a smoother build when the app is ready.

Treat this as a stabilization and polish sprint, not a rewrite.

## What Can Affect Current Users

Safe to change locally:

- Frontend app code
- UI layout and styling
- Local TypeScript/lint fixes
- Documentation
- Staged feature code that is not shipped

Be careful with:

- Production Supabase schema changes
- Production Supabase data changes
- Scraper runs that write to production
- GitHub Actions that update production data
- Expo/EAS updates
- New App Store/TestFlight builds

## Priority 1: Protect Unlaunched Features

Push notifications are implemented in code, but they are not launched yet. Before the next build, notification registration should be guarded behind a feature flag so the app does not accidentally ask users for notification permission or write to `push_tokens`.

Suggested approach:

```ts
const ENABLE_PUSH_NOTIFICATIONS =
  process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS === 'true';
```

Then only call notification registration when the flag is enabled.

This keeps the notification work in the repo without making it part of the next build unless intentionally enabled.

## Priority 2: Align Active Supabase Contract

Some app code expects database fields/functions that the generated Supabase types currently do not know about. This may be because migrations are staged, production has not been updated yet, or generated types are stale.

Check active app dependencies before shipping:

- `meets.end_date`
- `get_top_performances`
- live results fields used by the app
- event normalization fields/functions used by visible screens

If these are already in production, regenerate types:

```bash
npm run gen:types
```

If they are not ready for production, avoid making current visible screens depend on them.

## Priority 3: Get Frontend Build-Clean

Before a new build, run:

```bash
cd frontend
npx tsc --noEmit
npm run lint
```

Fix errors first. Warnings can be cleaned up after the build is stable, unless they point to a real runtime risk.

Known current themes:

- Supabase generated type drift
- Nullable database fields not handled in app types
- JSX lint errors for unescaped apostrophes
- Missing display names in share-card components
- Some unused imports and hook dependency warnings

## Priority 4: Home Screen Polish

The Home screen is the front door. It currently carries a lot of responsibility: welcome content, weekly top performances, filters, latest results, upcoming meets, sharing, onboarding, and hints.

Goals:

- Make Weekly Top Performances the clearest main module
- Keep filters obvious and easy to use
- Make Upcoming Meets and Latest Results secondary but useful
- Reduce visual clutter where it competes with the data
- Make empty/loading/error states feel intentional

## Priority 5: Meets Screen

The Meets tab should quickly answer what users care about:

- What is live?
- What is coming up?
- What recently happened?

Goals:

- Clear separation between Live, Upcoming, and Past/Recent
- Good empty state when no meets are live
- Fast loading and refresh behavior
- Reliable handling of multi-day meets

## Priority 6: Athlete Search and Profiles

Athlete discovery is a core retention path.

Check:

- Search speed and accuracy
- Search result clarity
- Athlete detail loading state
- PRs and recent performances
- School/team context
- Compare athlete entry point

## Priority 7: Label or Remove Legacy Paths

The repo still contains older/transitional pieces:

- `frontend/services/api.ts` points to a local LAN API
- `backend/server` is an Express + SQLite server

If these are still useful, label them as legacy or dev-only. If they are no longer needed, remove or isolate them later. The goal is to avoid confusing them with the current Supabase-first app path.

## Priority 8: Env Hygiene

The frontend should only need public client-safe environment variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Service role keys and database passwords should stay out of frontend env files. Even if ignored by git, keeping secrets near frontend code increases the chance of accidental exposure later.

## Suggested Work Order

1. Guard notifications behind a feature flag.
2. Decide which staged features are included in the next build.
3. Confirm production Supabase has the schema/functions needed by active screens.
4. Regenerate Supabase types when the database contract is ready.
5. Fix TypeScript errors.
6. Fix lint errors.
7. Polish Home.
8. Polish Meets.
9. Polish Athlete Search/Profile.
10. Test on a physical phone before building.

## Release Sanity Checklist

- App opens cleanly on fresh install
- Splash and welcome flow behave correctly
- Home loads top performances
- Filters work
- Meets tab loads live/upcoming/past data correctly
- Search works
- Athlete detail pages load
- School detail pages load
- Compare athletes works
- No unlaunched feature prompts appear
- No production secrets are exposed in frontend config
- TypeScript passes
- Lint has no blocking errors

