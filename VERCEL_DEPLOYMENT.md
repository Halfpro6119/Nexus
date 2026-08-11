# Deploy Nexus on Vercel

Nexus is a Next.js application and can be hosted on Vercel. Browser automation is intentionally kept outside Vercel functions: deploy the included Nexus scraper and screenshot service to Cloud Run.

## 1. Import the repository

In Vercel, import `Halfpro6119/Nexus`. Keep the defaults:

- Framework: Next.js
- Build command: `npm run build`
- Install command: `npm ci`
- Output directory: leave empty

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

Required for hosted screenshots and website audits:

- `SCREENSHOT_ENDPOINT` - the HTTPS URL of the Cloud Run screenshot service
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` - prevents Vercel from downloading a local Chromium binary; Vercel uses the Cloud Run screenshot service instead

Required for lead discovery on Vercel:

- `CLOUD_RUN_SCRAPER_PROJECT`
- `CLOUD_RUN_SCRAPER_REGION`
- `CLOUD_RUN_SCRAPER_JOB`

The service account in `GOOGLE_SERVICE_ACCOUNT_JSON` must have permission to run the Cloud Run Job with execution overrides. Grant it the **Cloud Run Developer** role on the scraper job, which includes the `run.jobs.runWithOverrides` permission.

Add Gmail, Microsoft, GitHub, Google Sheets and other integration variables only when those features are enabled.

Do not add `GOOGLE_APPLICATION_CREDENTIALS` to Vercel. It is a local file path. Vercel uses `GOOGLE_SERVICE_ACCOUNT_JSON` instead.

## 3. Deploy the screenshot service to Cloud Run

From the repository root, deploy the service in `services/screenshot` or use the existing scraper Cloud Run setup. Set its public HTTPS URL as `SCREENSHOT_ENDPOINT` in Vercel. The main Vercel application will not launch Playwright locally in production.

## 4. Configure external callbacks

Update these providers to use your deployed `NEXT_PUBLIC_APP_URL`:

- Google OAuth callback: `/api/auth/gmail/callback`
- Microsoft OAuth callback: `/api/auth/microsoft/callback`

Redeploy after adding or changing environment variables.

## Operational notes

- Vercel runs the web application and API routes.
- The Nexus-owned Cloud Run Job runs Google Maps lead discovery for Vercel deployments and writes results to Supabase incrementally.
- Cloud Run runs Playwright screenshots.
- Supabase stores application data.
- Vertex AI requests run from Node.js server routes using the Vercel secret service-account JSON.
