# Nexus Cloud Run scraper

The production scraper is deployed as `nexus-lead-scraper` in project
`riley-ai-api`, region `europe-west1`.

The job uses the dedicated service account
`nexus-scraper@riley-ai-api.iam.gserviceaccount.com`. It can read only the
`nexus-supabase-url` and `nexus-supabase-service-role` Secret Manager secrets.

Run a single campaign:

```powershell
gcloud run jobs execute nexus-lead-scraper `
  --project=riley-ai-api `
  --region=europe-west1 `
  --update-env-vars="SCRAPE_NICHE=Dental practices,SCRAPE_LOCATION=London UK,SCRAPE_MODE=single" `
  --wait
```

Run a multi-area campaign by changing `SCRAPE_MODE=multi`. Execution-specific
overrides do not modify the job's saved production limits.

Build and deploy a new worker image:

```powershell
gcloud builds submit --config=cloudbuild.scraper.yaml `
  --substitutions=_IMAGE=europe-west1-docker.pkg.dev/riley-ai-api/nexus-scraper/worker:latest `
  --project=riley-ai-api .

gcloud run jobs deploy nexus-lead-scraper `
  --image=europe-west1-docker.pkg.dev/riley-ai-api/nexus-scraper/worker:latest `
  --project=riley-ai-api `
  --region=europe-west1
```
