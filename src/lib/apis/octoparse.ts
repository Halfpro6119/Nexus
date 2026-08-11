import type { Lead } from "@/types";

const BASE_URL = "https://openapi.octoparse.com/api/agentTools";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : {};
}

function text(row: JsonObject, names: string[]): string | undefined {
  for (const name of names) {
    const value = row[name];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function stableId(row: JsonObject): string {
  const native = text(row, ["place_id", "placeId", "google_place_id", "cid", "id"]);
  if (native) return `octoparse:${native}`;
  const identity = `${text(row, ["name", "title", "business_name"]) ?? "business"}|${text(row, ["address", "formattedAddress"]) ?? ""}|${text(row, ["phone", "phoneNumber", "telephone"]) ?? ""}`;
  return `octoparse:${Buffer.from(identity).toString("base64url").slice(0, 100)}`;
}

function rowsToLeads(rows: unknown[], niche: string, location: string): Lead[] {
  const leads = rows.map(value => object(value)).map(row => ({
    id: crypto.randomUUID(),
    business_name: text(row, ["business_name", "name", "title", "company", "companyName"]) ?? "Unknown business",
    website_url: text(row, ["website_url", "website", "url", "site"]) ?? null,
    phone: text(row, ["phone", "phoneNumber", "telephone", "contact_number"]) ?? null,
    address: text(row, ["address", "formattedAddress", "full_address", "location"]) ?? null,
    google_place_id: stableId(row),
    niche,
    location,
    status: "Discovered" as const,
    created_at: new Date().toISOString(),
  }));
  const names = new Set(leads.map(lead => lead.business_name.trim().toLowerCase()).filter(name => name !== "unknown business"));
  const identities = new Set(leads.map(lead => `${lead.address ?? ""}|${lead.phone ?? ""}|${lead.website_url ?? ""}`));
  if (leads.length > 1 && names.size === 1 && identities.size > 1) {
    throw new Error("Octoparse returned multiple businesses with the same extracted name; fix the business_name field to extract inside the current result loop");
  }
  return [...new Map(leads.map(lead => [lead.google_place_id, lead])).values()];
}

async function octoparse(path: string, init?: RequestInit): Promise<JsonObject> {
  const apiKey = process.env.OCTOPARSE_API_KEY;
  if (!apiKey) throw new Error("OCTOPARSE_API_KEY is not configured");
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": apiKey,
      ...(process.env.OCTOPARSE_EXTERNAL_USER_ID ? { "x-external-user-id": process.env.OCTOPARSE_EXTERNAL_USER_ID } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Octoparse request failed (${response.status}): ${JSON.stringify(payload).slice(0, 400)}`);
  return object(payload);
}

async function updateTaskUrls(taskId: string, urls: string[]): Promise<void> {
  const apiKey = process.env.OCTOPARSE_API_KEY;
  if (!apiKey) throw new Error("OCTOPARSE_API_KEY is not configured");
  const form = new FormData();
  form.set("taskId", taskId);
  form.set("file", new Blob([urls.join("\n")], { type: "text/plain" }), "nexus-search-urls.txt");
  const response = await fetch("https://openapi.octoparse.com/task/urls:file", {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Octoparse URL update failed (${response.status}): ${JSON.stringify(payload).slice(0, 400)}`);
}

interface TemplateChoice { name: string; fields: string[] }

async function chooseTemplate(): Promise<TemplateChoice> {
  if (process.env.OCTOPARSE_TEMPLATE_NAME) return { name: process.env.OCTOPARSE_TEMPLATE_NAME, fields: [] };
  const response = await octoparse("/searchTemplates?keyword=Google%20Maps%20business%20leads&page=1&limit=10");
  const data = object(response.data);
  const templates = Array.isArray(data.templates) ? data.templates.map(value => object(value)) : [];
  const recommended = text(data, ["recommendedTemplateName"]);
  const selected = templates.find(template => text(template, ["templateName", "slug"]) === recommended) ?? templates[0];
  const name = recommended ?? (selected ? text(selected, ["templateName", "slug"]) : undefined);
  if (!name) return {
    name: "google-maps-scraper-store-details-by-keyword",
    fields: ["search_Keywords", "number_of_Pages_to_Scrape"],
  };
  const schema = selected && Array.isArray(selected.inputSchema) ? selected.inputSchema.map(value => object(value)) : [];
  return { name, fields: schema.map(field => text(field, ["field"])).filter((field): field is string => Boolean(field)) };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function downloadRows(url: string): Promise<unknown[]> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Octoparse export download failed (${response.status})`);
  const payload: unknown = await response.json();
  if (Array.isArray(payload)) return payload;
  const value = object(payload);
  return Array.isArray(value.data) ? value.data : [];
}

export async function searchPlacesCampaign(niche: string, location: string, requestedCount: number) {
  const target = Math.min(500, Math.max(1, requestedCount));
  const existingTaskId = process.env.OCTOPARSE_TASK_ID;
  if (existingTaskId) {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${niche} in ${location}`).replace(/%20/g, "+")}`;
    await updateTaskUrls(existingTaskId, [searchUrl]);
    const started = await octoparse("/startOrStopTask", {
      method: "POST",
      body: JSON.stringify({ taskId: existingTaskId, action: "start" }),
    });
    const startData = object(started.data);
    const startStatus = text(startData, ["status"]);
    if (!startStatus || ["start_rejected", "invalid", "failed"].includes(startStatus)) {
      throw new Error(`Octoparse task could not start: ${JSON.stringify(startData).slice(0, 400)}`);
    }
    return await pollTaskExport(existingTaskId, niche, location, target);
  }
  const template = await chooseTemplate();
  const keywordField = process.env.OCTOPARSE_KEYWORD_FIELD ?? "search_keyword";
  const locationField = process.env.OCTOPARSE_LOCATION_FIELD ?? "location";
  const discoveredKeywordField = template.fields.find(field => /search.*keyword|keyword/i.test(field));
  const discoveredLocationField = template.fields.find(field => /location|area|region|city/i.test(field));
  const pagesField = template.fields.find(field => /number.*pages|pages.*scrape/i.test(field));
  const parameters: JsonObject = { [discoveredKeywordField ?? keywordField]: [`${niche} in ${location}`] };
  if (discoveredLocationField) parameters[discoveredLocationField] = location;
  else if (!template.fields.length) parameters[locationField] = location;
  if (pagesField) parameters[pagesField] = Math.min(100, Math.max(1, Math.ceil(target / 20)));
  const started = await octoparse("/executeTask", {
    method: "POST",
    body: JSON.stringify({ templateName: template.name, taskName: `Nexus - ${niche} in ${location}`, parameters: JSON.stringify(parameters), targetMaxRows: target }),
  });
  const startData = object(started.data);
  const taskId = text(startData, ["taskId"]);
  if (!taskId) throw new Error(`Octoparse did not start the task: ${JSON.stringify(startData).slice(0, 400)}`);

  return await pollTaskExport(taskId, niche, location, target);
}

async function pollTaskExport(taskId: string, niche: string, location: string, target: number) {
  for (let attempt = 0; attempt < 12; attempt++) {
    if (attempt) await sleep(5_000);
    const exported = await octoparse(`/exportData?taskId=${encodeURIComponent(taskId)}&exportFileType=JSON&previewRows=${Math.min(target, 1000)}`);
    const data = object(exported.data);
    const status = text(data, ["status"]);
    if (["failed", "invalid", "no_data"].includes(status ?? "")) {
      // Existing tasks can briefly expose the previous run's terminal export while
      // a newly requested cloud run is starting. Give the new run time to appear.
      if (attempt < 3) continue;
      throw new Error(`Octoparse task ended with status ${status}`);
    }
    if (status === "exported") {
      let rows = Array.isArray(data.sampleData) ? data.sampleData : [];
      const exportUrl = text(data, ["exportFileUrl"]);
      if (exportUrl) rows = await downloadRows(exportUrl);
      return { leads: rowsToLeads(rows, niche, location).slice(0, target), areas: [location], sources: ["octoparse"] };
    }
  }
  throw new Error("Octoparse is still collecting leads; retry shortly or use a faster template");
}
