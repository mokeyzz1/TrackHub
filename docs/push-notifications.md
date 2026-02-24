# Push Notifications Setup

## Status: Ready to Deploy

Code is complete. Needs one native build to activate.

## Setup Steps (One-Time)

### 1. Run the migration in Supabase SQL Editor

Copy from: `supabase/migrations/20260220_push_tokens.sql`

### 2. Build new app version

```bash
cd frontend
eas build --platform ios --profile production
```

### 3. Submit to App Store

After build completes, submit for review.

### 4. Install on your device first to test

You'll be prompted for notification permission.

---

## Sending Notifications

Once setup is complete, send notifications anytime:

```bash
cd scrapers/tools
node send-notification.js "Your message here"
```

### With custom title:

```bash
node send-notification.js "John Doe just ran 9.95!" --title "New PR Alert"
```

### Examples:

```bash
node send-notification.js "🔥 Big 12 results are in!"
node send-notification.js "Check out the SEC Championships results" --title "New Meet"
```

---

## How It Works

1. App registers device token on startup → saved to `push_tokens` table
2. You run CLI script → fetches all tokens → sends via Expo Push API
3. All users with the new build receive the notification

---

## Files

| File | Purpose |
|------|---------|
| `frontend/services/notifications.ts` | Registers push tokens |
| `frontend/app/_layout.tsx` | Calls registration on startup |
| `supabase/migrations/20260220_push_tokens.sql` | Database table |
| `scrapers/tools/send-notification.js` | CLI to send notifications |
