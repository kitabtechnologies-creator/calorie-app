# Daily Value — AI food & nutrition tracker

A Next.js app: real login, a profile-driven daily calorie/macro target, photo-based
meal logging via Gemini vision, manual food search against the free USDA nutrition
database, and a history view with charts + AI "coach" insights.

## Stack
- **Next.js 14** (App Router) — the app itself
- **Supabase** — email login + Postgres database (free tier is plenty)
- **Gemini API** (`@google/genai`) — analyzes meal photos, generates coaching insights
- **USDA FoodData Central** — free nutrition database for manual food search
- **Recharts** + Tailwind — charts and the "nutrition label" UI

Nothing is stored in browser storage — everything (profile, every log entry) lives in
Supabase, so history is real and survives across devices.

## 1. Create a Supabase project (2 minutes)
1. Go to https://supabase.com → New project (free tier).
2. Once it's ready, open **SQL Editor** → paste the contents of `supabase/schema.sql` → Run.
3. Go to **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. In **Authentication → Providers**, email sign-up is on by default. If you don't want
   email confirmation emails during testing, turn off "Confirm email" under
   **Authentication → Settings**.

## 2. Get a Gemini API key (free)
Go to https://aistudio.google.com/apikey → Create key → copy it into `GEMINI_API_KEY`.

## 3. (Optional) Get a free USDA API key
For the manual "search a food" feature: https://fdc.nal.usda.gov/api-key-signup.html
(instant, no waiting). Without it, the app still works using USDA's shared `DEMO_KEY`,
just with a lower rate limit.

## 4. Configure environment variables
```bash
cp .env.example .env.local
# then fill in the four values above
```

## 5. Run it locally
```bash
npm install
npm run dev
```
Open http://localhost:3000 — sign up, fill in the profile form, and start logging.

## 6. Deploy to Vercel (free)
1. Push this folder to a GitHub repo (or use `npx vercel` directly from this folder —
   the Vercel CLI can deploy without GitHub too).
2. Go to https://vercel.com/new → import the repo.
3. In the import screen, add the same 4 environment variables from `.env.local`.
4. Deploy. Vercel gives you a public `https://your-app.vercel.app` URL — that's the link
   to send your mom. She can add it to her phone's home screen like an app.

## Notes on the AI photo feature
- The exact analysis prompt lives in `app/api/analyze/route.ts` — it's the same one you
  wrote, asking Gemini to return strict JSON (foods, totals, health score, confidence,
  one-line recommendation).
- The Gemini API key is only ever used server-side (in the API route), so it's never
  exposed in the browser.
- AI photo estimates are just that — estimates. Good for a fast log, not lab-grade
  accuracy. The confidence score shown after each scan reflects that.

## Project structure
```
app/
  login/          sign in / sign up
  onboarding/      age, height, weight, goal, activity → daily targets
  dashboard/       today's totals, photo upload, manual search, log list
  history/         charts (7/30/90 day) + AI coach insight
  api/analyze/     Gemini vision → nutrition JSON
  api/insights/    Gemini text → behavioral analysis
  api/food-search/ USDA FoodData Central proxy
lib/
  nutrition.ts     Mifflin-St Jeor BMR + macro target calculation
  supabase/        browser + server Supabase clients
supabase/schema.sql  run this once in Supabase's SQL editor
```

## Extending it
- Add weight-trend tracking by logging `weight_kg` over time in a small `weigh_ins` table.
- Add push/email reminders with Supabase's scheduled Edge Functions.
- Swap the macro-split heuristic in `lib/nutrition.ts` for whatever ratio you prefer.
