# Crutkai Petty Cash

A mobile-first PWA for logging a yacht's petty cash. Crew photograph paper
receipts, Claude vision extracts the data, crew assign each receipt to a
department, and everything is stored in Supabase.

**Stack:** Next.js 16 (App Router, TypeScript) · Tailwind v4 · Supabase
(Auth + Postgres + Storage) · Anthropic Claude (`claude-sonnet-4-6`) · Vercel.

> Built on **Next.js 16**, which renames `middleware` → `proxy` and makes
> `cookies()`, `params`, and `searchParams` async. Session refresh lives in
> `src/proxy.ts` (function `proxy`), not `middleware.ts`.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Deploy the database.** In the Supabase dashboard → SQL Editor, run
   `03_petty_cash_schema.sql` (tables, RLS, the private `receipts` storage
   bucket, and seed departments). Then:
   - Auth → Users → create the 3–5 crew accounts (email + initial password).
   - Set `user_profiles.role = 'admin'` for Craig and Tim.

3. **Configure environment.** Copy `.env.example` to `.env.local` and fill in:

   ```
   NEXT_PUBLIC_SUPABASE_URL=        # Project Settings → API
   NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Project Settings → API
   SUPABASE_SERVICE_ROLE_KEY=       # Project Settings → API (server-only)
   ANTHROPIC_API_KEY=               # console.anthropic.com
   ```

   The service-role key is used only server-side to write `audit_log` rows
   (which RLS blocks for normal clients). Never expose it to the browser.

4. **Run it**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## Icons

`public/icon-192.png` and `icon-512.png` are solid-color placeholders generated
by `scripts/make-icons.mjs`. Replace them with real artwork before delivery.

## Deploy to Vercel

1. Push to a private GitHub repo.
2. Import into Vercel; add all four env vars from `.env.local` in the Vercel
   dashboard.
3. Production branch = `main`; preview deploys for PRs are on by default.

## Add to Home Screen (iPhone)

One-page guide for crew:

1. Open the app URL in **Safari** (not Chrome — iOS only installs from Safari).
2. Tap the **Share** button (square with an up arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the top-right.
5. Open the new **Petty Cash** icon from the home screen — it launches
   full-screen with no Safari chrome.
6. Sign in with the email and password from the captain.

## How it works

- `src/proxy.ts` refreshes the Supabase session on every request and redirects
  signed-out users to `/login`.
- `(app)/` is the protected area (receipts list, capture, detail, admin export).
- `/api/extract` sends the receipt image to Claude and returns structured JSON.
- `/api/receipts` and `/api/receipts/[id]` write rows plus `audit_log` entries.
- `/api/export` streams an admin-only CSV.
- Row Level Security scopes crew to their own receipts; admins see all.
