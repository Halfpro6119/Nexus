import { GoogleAuth } from "google-auth-library";

type ServiceAccount = {
  type?: string;
  project_id?: string;
  private_key?: string;
  client_email?: string;
  token_uri?: string;
};

function inlineCredentials(): ServiceAccount | undefined {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as ServiceAccount;
  } catch {
    // The actionable configuration error below is clearer than a JSON parser message.
  }
  throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must contain a valid service-account JSON object.");
}

export async function dispatchCloudRunScraper(niche: string, location: string, mode: "single" | "multi"): Promise<string> {
  const project = process.env.CLOUD_RUN_SCRAPER_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  const region = process.env.CLOUD_RUN_SCRAPER_REGION;
  const job = process.env.CLOUD_RUN_SCRAPER_JOB;
  if (!project || !region || !job) {
    throw new Error("Cloud Run lead scraper is not configured. Set CLOUD_RUN_SCRAPER_PROJECT, CLOUD_RUN_SCRAPER_REGION and CLOUD_RUN_SCRAPER_JOB.");
  }
  const credentials = inlineCredentials();
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    ...(credentials ? { credentials } : {}),
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  const token = typeof accessToken === "string" ? accessToken : accessToken.token;
  if (!token) throw new Error("Could not obtain a Google Cloud access token for the Cloud Run job.");
  const name = `projects/${project}/locations/${region}/jobs/${job}`;
  const response = await fetch(`https://run.googleapis.com/v2/${name}:run`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      overrides: {
        containerOverrides: [{
          env: [
            { name: "SCRAPE_NICHE", value: niche },
            { name: "SCRAPE_LOCATION", value: location },
            { name: "SCRAPE_MODE", value: mode },
          ],
        }],
      },
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as { name?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? `Cloud Run scraper dispatch failed (${response.status})`);
  return payload.name ?? name;
}
