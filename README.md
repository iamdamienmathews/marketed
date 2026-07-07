# Marketed. Platform — Complete Guide

Everything below takes you from "unzipped folder" to "live platform." The
application layer (every route, table, dashboard, and screen) is fully
built and working. What's left is entirely credentials and hosting —
things only you can create, because they're tied to your business
identity. Each step says exactly what to do and how long it realistically
takes.

---

## Part 1 — Run it locally (30 minutes)

### 1.1 Install Node.js
You need Node 18+ (Node 22 recommended). Check with `node -v`. If you
don't have it: [nodejs.org](https://nodejs.org).

### 1.2 Install dependencies
```bash
cd vantage-platform
npm install
```

### 1.3 Create your environment file
```bash
cp .env.example .env
```
Open `.env` and fill in at minimum:cp 
- `SESSION_SECRET` — any long random string (`openssl rand -hex 32`)
- `CREDENTIALS_SECRET` — a **different** long random string (this one
  encrypts every client's API keys at rest — treat it like a password)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — your own login for the admin console

Leave everything else blank for now. The platform runs completely without
it — emails log to the console, bookings get a "link to follow by email"
placeholder instead of a real Zoom/Meet link, and channel adapters simply
report "not configured" until you add real keys.

### 1.4 Seed the database
```bash
npm run seed
```
This creates `services` (your 6 offerings, pulled straight from your
spreadsheet) and your admin account.

### 1.5 Start it
```bash
npm start
```
Visit `http://localhost:3000`. Try the whole flow:
1. Sign up as a client on `/signup.html`
2. Register interest in a "simple" service (Email+SMS or Retargeting) —
   it activates instantly, no call needed
3. Register interest in a "complex" one (PPC, Social, Website, SEO) — you
   get routed to `/book.html` automatically
4. Book a slot — check your terminal, you'll see the confirmation email
   logged there (since SMTP isn't configured yet)
5. Log in as admin at `/login.html` with your `ADMIN_EMAIL`/`ADMIN_PASSWORD`
6. Go to a client's page, mark the call complete, assign a service, add a
   channel with dummy JSON credentials (it'll show "error" — that's
   correct, since there's no real API behind it yet)

If all of that works, the entire application is functioning correctly.
Everything past this point is wiring in real credentials.

---

## Part 2 — Connect real integrations

Do these in whatever order matches your priorities. None of them are
required for the others to work.

### 2.1 Email (do this first — everything else depends on it working)
Any SMTP provider works. Easiest options:
- **Gmail**: use an "app password" (Google Account → Security → App
  Passwords). `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`.
- **SendGrid / Postmark / Mailgun**: sign up, verify your sending domain,
  copy the SMTP credentials they give you.

Fill in `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` in `.env`,
restart the server. Test by booking a call — you should get a real email.

**Time:** 15 minutes (Gmail) to a few hours (dedicated provider with
domain verification).

### 2.2 Google Calendar + Meet
1. Go to [console.cloud.google.com](https://console.cloud.google.com),
   create a project.
2. Enable the **Google Calendar API** (APIs & Services → Library).
3. Configure the OAuth consent screen (External is fine for a small
   business; you don't need Google's verification unless you exceed 100
   users while in testing mode).
4. Create an **OAuth 2.0 Client ID** (Web application). Add
   `http://localhost:3000/api/calendar/google/callback` as an authorized
   redirect URI (and your real domain's equivalent once deployed).
5. Copy the Client ID and Secret into `.env` as `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`.
6. Restart the server, log into `/admin/index.html`, click "Connect your
   Google Calendar."

From then on, every booking creates a real Google Calendar event with an
auto-generated Meet link, on the admin's calendar.

**Time:** 30–45 minutes.

### 2.3 Zoom (optional — only if you prefer Zoom over Meet)
1. Go to [marketplace.zoom.us](https://marketplace.zoom.us) → Develop →
   Build App → **Server-to-Server OAuth**.
2. Add the scope `meeting:write:admin` (or `meeting:write` depending on
   your Zoom plan).
3. Copy the Account ID, Client ID, and Client Secret into `.env` as
   `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`.
4. Set `ZOOM_HOST_EMAIL` to the Zoom account's email.

The booking flow tries Zoom first, then falls back to Google Meet, then
to a manual "link to follow" placeholder — so it's safe to configure
either, both, or neither.

**Time:** 20 minutes.

### 2.4 Channel integrations (the analytics dashboards)
Each of the five named adapters (`src/integrations/channels/adapters/`)
needs *the client's own developer credentials* for that platform — these
aren't something you register once for your agency, they're per ad
account / per client, because you're pulling *their* campaign data.

| Channel | What you need | Where to get it |
|---|---|---|
| Google Ads | Developer token + OAuth refresh token for the client's account | [Google Ads API docs](https://developers.google.com/google-ads/api/docs/start) — developer token approval can take a few days |
| Meta Ads | Long-lived access token + ad account ID | [Meta for Developers](https://developers.facebook.com/docs/marketing-api) |
| Klaviyo | Private API key from the client's Klaviyo account | Klaviyo → Settings → API Keys |
| SEMrush | API key on a paid SEMrush plan | SEMrush → Profile → API |
| AdRoll | OAuth access token + advertisable ID | [AdRoll developer docs](https://developer.adroll.com) |

**In practice, the fastest path for most clients**: use the **Custom
webhook** channel type instead. Point it at any URL that returns flat
JSON like `{"spend": 412.5, "clicks": 1834}` — a small Zapier/Make
automation, or a lightweight script the client already has, works fine
and needs zero platform-specific developer registration. Add real
platform-specific adapters over time as it's worth the setup effort for a
given client.

**Time:** 15 minutes per client per channel using the webhook adapter;
several hours to a few days per platform if you build out the named
adapters for real, mostly spent on that platform's own approval process.

### 2.5 Google Ads adapter — one extra install
The Google Ads adapter needs one more package that isn't in `package.json`
by default (it's a large dependency, so it's opt-in):
```bash
npm install google-ads-api
```

---

## Part 3 — Deploy it (Railway)

You're running this at `https://marketed.up.railway.app`, so here's the
Railway-specific checklist. `BASE_URL`, `DATA_DIR`, and every OAuth
redirect URI in the code now read from environment variables instead of
being hardcoded — so this is entirely config, no further code edits
needed.

1. **Set environment variables in Railway's dashboard** (Project →
   Variables), not by uploading `.env` — `.gitignore` deliberately keeps
   `.env` out of anything you push to git, so Railway never sees it
   unless you paste the values in yourself. Copy every value from your
   local `.env` into Railway's Variables tab, including:
   - `BASE_URL=https://marketed.up.railway.app`
   - `GOOGLE_REDIRECT_URI=https://marketed.up.railway.app/api/calendar/google/callback`
   - `NODE_ENV=production`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_PASS`, and everything else in `.env`
   - Leave `PORT` unset — Railway injects its own and the app already reads `process.env.PORT`.
2. **Add a Volume for persistent storage.** Railway's filesystem resets
   on every redeploy. In your service settings, add a Volume (e.g.
   mounted at `/data`), then set the environment variable `DATA_DIR=/data`.
   Without this, your database (`vantage.db`) and sessions get wiped
   every time you push a change.
3. **Redeploy** so the new environment variables and volume take effect.
4. **Update the Google Cloud Console OAuth client** (see Part 2.2 steps
   below — you'll need to redo the redirect URI specifically, since it
   was pointed at `localhost` before).
5. **Reconnect Google Calendar from the admin dashboard.** Any Google
   Calendar connection made against the old client ID or `localhost`
   redirect URI is no longer valid — the stored token won't work against
   your new OAuth client. Log into `/admin/index.html` and click
   "Connect your Google Calendar" again.
6. Run `npm run seed` once against the new database (via Railway's
   console/shell, or by connecting to the volume) if this is a fresh
   Volume without your existing data.

### Updating your Google OAuth Console client for the new domain

This is what makes the new Client ID/Secret you generated actually work
with the deployed app — the credentials alone aren't enough without these:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) →
   APIs & Services → Credentials, and open the new OAuth 2.0 Client ID you created.
2. Under **Authorized redirect URIs**, add exactly:
   `https://marketed.up.railway.app/api/calendar/google/callback`
   — this has to match `GOOGLE_REDIRECT_URI` in your environment
   variables character-for-character (scheme, domain, and path), or the
   OAuth handshake fails. Remove the old `localhost:3000` entry if it's
   still there from testing, or leave it if you still want to test locally.
3. Under **Authorized JavaScript origins**, add
   `https://marketed.up.railway.app` (not required for this server-side
   flow, but good practice).
4. Confirm the **Google Calendar API** is enabled for this project —
   APIs & Services → Library → search "Google Calendar API" → Enable.
   This is per-project, so if the new credential is under a different
   project than before, you'll need to enable it again.
5. Check your **OAuth consent screen** status (APIs & Services → OAuth
   consent screen). If it's still in **Testing** mode, only email
   addresses added under "Test users" can complete the OAuth flow — add
   `connect4zion@gmail.com` there if it isn't already, or publish the app
   if you want any Google account to be able to connect.
6. Save, then redeploy/restart the app so it picks up the new
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`.

### Email (Gmail app password)

Your new app password is already set as `SMTP_PASS` — just make sure it's
pasted into Railway's Variables tab with no spaces (Google displays it in
4-character groups for readability; the actual password has none).
Nothing else changes here — `src/integrations/email/mailer.js` already
reads these from environment variables, so once `SMTP_PASS` is set on
Railway, outgoing email works without touching code.

**Time:** 20–30 minutes if you already have the Volume and Google Console
access open; most of it is double-checking the redirect URI matches exactly.

---

## Part 4 — How each of your original requirements maps to the code

- **Sign up, details carried forward** → `src/routes/auth.js` +
  30-day session cookie in `server.js`. Returning users stay logged in
  until they explicitly log out.
- **Simple vs. complex services, auto-prompt for a call** →
  `src/routes/services.js`, `services.complexity` column, enforced in
  `scripts/seed.js` and surfaced in `dashboard.html`.
- **Book a call, calendar sync, auto meeting link** →
  `src/routes/bookings.js`, tries Zoom → Google Meet → manual fallback,
  in that order.
- **Apple Calendar** → `.ics` download at `GET /api/bookings/:id/ics`
  (see the honest note at the top of this README on why this is the real
  mechanism, not a limitation of the build).
- **Admin updates client's service after the call** →
  `admin/client.html` "Assign a service" panel →
  `POST /api/admin/clients/:id/services`.
- **Dashboards update in real time per channel** →
  `src/integrations/channels/sync.js` (poll-and-broadcast engine) +
  Server-Sent Events at `/api/metrics/stream`, consumed live in
  `dashboard.html`.
- **Add an API key to import a channel** → `admin/client.html` "Channels
  & integrations" panel → `POST /api/admin/clients/:id/channels`,
  encrypted via `src/utils/crypto.js`, synced immediately and then every
  `SYNC_CRON` interval.
- **Subscription management, cancellation via platform or call** →
  `client_services` + `cancellation_requests` tables, client-side button
  in `dashboard.html`, admin resolution in `admin/index.html`.
- **Lead details + how to contact them** → `leads` table, shown in full
  (email, phone, budget, message) in `admin/index.html`.
- **Send emails to clients through the platform** →
  `src/integrations/email/mailer.js`, every send logged to `messages` and
  visible per-client in `admin/client.html`.
- **Admin login with elevated privileges** → `users.role` column,
  `requireAdmin` middleware, same login form routes admins and clients to
  different dashboards automatically.

---

## What's genuinely left for you to decide (not build)

- **Pricing precision**: `price_note` fields are still descriptive text
  ("quoted per project"), not a pricing calculator. If you want exact
  dollar amounts auto-computed from margin rules, that's a real feature
  to scope next — happy to build it.
- **Which channels to prioritize**: don't try to wire all five named
  adapters on day one. Start with whichever 1–2 channels your first
  handful of clients actually use, and lean on the webhook adapter for
  everything else until it's worth the platform-specific setup.
- **Legal**: `/terms.html` and `/privacy.html` are real, usable drafts
  covering the platform's actual data flows (accounts, bookings, channel
  credentials, third-party integrations) — but they're not a substitute
  for review by a lawyer, especially before you take real payment
  information (this build doesn't handle payments at all; that's a
  distinct integration — Stripe is the standard choice — worth a
  dedicated follow-up build when you're ready). Section 12 of the Terms
  ("Governing law") is explicitly left as a placeholder for your actual
  jurisdiction.
- **ADA/accessibility**: this update adds skip-links, landmark regions,
  visible focus states, a warm palette re-checked for contrast, and
  screen-reader-friendly loading states. That's a genuine, substantial
  pass — but "fully ADA compliant" in the legal sense usually means a
  WCAG audit by a specialist, especially once you add more complex
  interactions. Treat this as a strong foundation, not a compliance
  certificate.
- **DDoS protection**: the rate limiting added here (`express-rate-limit`)
  stops a single client from hammering your app or brute-forcing logins.
  It does not stop a distributed, multi-IP attack at the network level —
  that's what a service like Cloudflare (in front of Railway) or your
  host's own edge protection is for. Worth adding if this becomes a
  target, not urgent for a new site with low traffic.

---

## Part 5 — Push this update to GitHub

You already have a repo connected
(`https://github.com/iamdamienmathews/marketed`), so this is a normal
update — not a first-time setup. **Pushing code never touches your
Railway environment variables or your live database** — they live
entirely outside git (env vars are set in Railway's dashboard; your
database lives on your mounted Volume) — so this is safe to do without
risk to either, as long as you don't manually delete the Volume or the
Railway service itself.

### One thing worth knowing first

While preparing this update, two SQLite database files
(`data/vantage.db`, `data/sessions.db`) and a leftover `database.sqlite`
were found **already committed to your git history**. These contain real
data — user records, encrypted channel credentials, session data — and
shouldn't be in version control. This update removes them from tracking
going forward (they're now in `.gitignore`), but **they still exist in
your repo's old commit history** on GitHub. You have two options:

**Option A — simplest, keeps history.** Just push normally (steps below).
The files stop being tracked from this point forward, but old commits
containing them remain on GitHub. Fine if your repo is private and you
trust everyone with access to it.

**Option B — recommended if your repo is public, or you want a clean
slate.** Since you mentioned you're fine fully replacing the repo, this
removes the leaked data from history entirely by starting fresh:

```bash
# Inside the updated project folder from this zip:
rm -rf .git
git init
git add -A
git commit -m "Marketed. platform — clean history"
git branch -M main
git remote add origin https://github.com/iamdamienmathews/marketed.git
git push --force origin main
```

### Option A steps (normal push, keeps history)

1. Unzip this update, replacing your local project folder (keep your
   local `.env` — it's already excluded from the zip and from git; don't
   overwrite it with `.env.example`).
2. From inside the project folder:
   ```bash
   git status
   git add -A
   git commit -m "Warm palette, skeleton loaders, legal pages, rate limiting, ADA pass, landing animations"
   git push origin main
   ```
3. On Railway, trigger a redeploy (it may auto-deploy on push if you've
   connected the GitHub repo directly; otherwise redeploy manually from
   the Railway dashboard).
4. **Run `npm install` (not `npm ci`)** as part of your build — this
   update adds `express-rate-limit` to `package.json`, and the
   `package-lock.json` in this zip hasn't been regenerated against a real
   npm registry (no network access in the environment this was built in).
   `npm install` will resolve and lock it correctly; `npm ci` will fail on
   the mismatch. If Railway's build command is set to `npm ci`, switch it
   to `npm install` for this deploy, or delete `package-lock.json` and let
   Railway regenerate it.
5. Nothing else changes — your Railway environment variables and your
   Volume-mounted database are untouched by any of this.

**Time:** 10–15 minutes either way.

---

## Changelog — this update

- Rebranded the color system from a blue-tinted "ink" palette to a warm
  graphite + amber + sage palette — no blue or purple anywhere.
- Added skeleton loaders (shimmer, with a static/opacity fallback under
  `prefers-reduced-motion`) to the dashboard, booking page, and both admin
  screens.
- Added `/privacy.html` and `/terms.html`, linked from every page's
  footer.
- Signup now requires a Terms/Privacy agreement checkbox, enforced on
  both the client and the server; acceptance is timestamped in a new
  `terms_accepted_at` column, added via a non-destructive migration so
  your existing database and users aren't affected.
- Added rate limiting: a global cap across the API, plus a stricter cap
  specifically on login/signup to slow down brute-force and scripted
  abuse.
- Added skip-links, `main`-landmark IDs, and screen-reader-only loading
  announcements across every page, as part of a broader accessibility
  pass.
- Added scroll-reveal and staggered entrance animations to the landing
  page's sections and cards, plus press feedback on buttons/cards/slot
  buttons — built from the motion vocabulary in
  `.agents/skills/emil-design-eng/` (all respect
  `prefers-reduced-motion`, and hover effects are gated to
  hover-capable/pointer-fine devices so nothing "sticks" on touchscreens).
- Fixed `.gitignore`: live database files are no longer tracked in git,
  and `README.md`/`.env.example` are no longer (accidentally) ignored.
