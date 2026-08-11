# Deploy Nexus on Vercel

Nexus uses Vercel Services: the Next.js frontend runs at `/`, and the included Docker-backed Playwright screenshot service runs at `/api/screenshot`. Google Maps discovery remains in the Nexus-owned Cloud Run Job.

## 1. Import the repository

In Vercel, import `Halfpro6119/Nexus` and set the project framework to **Services**. The repository `vercel.json` builds both services and routes them under one deployment URL.

- Frontend service: Next.js from the repository root
- Screenshot service: Docker container from `services/screenshot`

## 2. Add production environment variables

Copy the required values from `.env.example` into **Project Settings > Environment Variables** for Production (and Preview if required).

Required for the core application:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION=global`
- `GOOGLE_SERVICE_ACCOUNT_JSON` - the complete service-account JSON pasted as one encrypted Vercel variable
- `NEXT_PUBLIC_APP_URL=https://your-production-domain`
- `OAUTH_STATE_SECRET` - a long random value

The screenshot service is automatically reachable at `/api/screenshot`. No `SCREENSHOT_ENDPOINT` is required on Vercel; the application automatically uses the current deployment URL. Set `SCREENSHOT_ENDPOINT` only if you intentionally want to use a separately hosted screenshot worker.

Required for lead discovery on Vercel:

- `CLOUD_RUN_SCRAPER_PROJECT`
- `CLOUD_RUN_SCRAPER_REGION`
- `CLOUD_RUN_SCRAPER_JOB`

The service account in `GOOGLE_SERVICE_ACCOUNT_JSON` must have permission to run the Cloud Run Job with execution overrides. Grant it the **Cloud Run Developer** role on the scraper job, which includes the `run.jobs.runWithOverrides` permission.

Add Gmail, Microsoft, GitHub, Google Sheets and other integration variables only when those features are enabled.

Do not add `GOOGLE_APPLICATION_CREDENTIALS` to Vercel. It is a local file path. Vercel uses `GOOGLE_SERVICE_ACCOUNT_JSON` instead.

## 3. Deploy the Cloud Run lead scraper

Deploy the existing Cloud Run Job using [CLOUD_RUN_SCRAPER.md](CLOUD_RUN_SCRAPER.md). The Vercel frontend triggers this job for lead discovery; the job owns the long-running browser scraping and writes results directly to Supabase.

## 4. Configure external callbacks

Update these providers to use your deployed `NEXT_PUBLIC_APP_URL`:

- Google OAuth callback: `/api/auth/gmail/callback`
- Microsoft OAuth callback: `/api/auth/microsoft/callback`

Redeploy after adding or changing environment variables.

## Operational notes

- Vercel runs the web application and API routes.
- The Nexus-owned Cloud Run Job runs Google Maps lead discovery for Vercel deployments and writes results to Supabase incrementally.
- The Vercel screenshot service runs Playwright in its Docker container.
- Supabase stores application data.
- Vertex AI requests run from Node.js server routes using the Vercel secret service-account JSON.
