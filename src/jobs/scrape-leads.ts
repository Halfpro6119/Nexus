import { searchPlacesCampaign, type ScraperMode } from "../lib/apis/google-maps-scraper";
import { dedupeLeads, normalizeAddress, normalizePhone } from "../lib/lead-identity";
import { getAdminClient } from "../lib/supabase/server";
import type { Lead, ScraperProgress } from "../types";

function log(event: ScraperProgress): void { console.log(JSON.stringify({ type: "progress", ...event })); }

async function main(): Promise<void> {
  const niche = process.env.SCRAPE_NICHE?.trim();
  const location = process.env.SCRAPE_LOCATION?.trim();
  const mode: ScraperMode = process.env.SCRAPE_MODE === "multi" ? "multi" : "single";
  if (!niche || !location) throw new Error("SCRAPE_NICHE and SCRAPE_LOCATION are required");
  const db = getAdminClient();
  if (!db) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

  const existing = { placeIds: new Set<string>(), addresses: new Set<string>(), phones: new Set<string>() };
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from("leads").select("google_place_id,address,phone").range(from, from + 499);
    if (error) throw error;
    for (const row of data ?? []) {
      existing.placeIds.add(row.google_place_id);
      const address = normalizeAddress(row.address), phone = normalizePhone(row.phone);
      if (address) existing.addresses.add(address);
      if (phone) existing.phones.add(phone);
    }
    if (!data || data.length < 500) break;
  }

  log({ timestamp: new Date().toISOString(), phase: "database", level: "success", message: `Loaded ${existing.placeIds.size} existing lead identities` });
  const inserted: Lead[] = [];
  const duplicates = { placeId: 0, address: 0, phone: 0 };
  let callQueueCount = 0;
  const saveLead = async (lead: Lead): Promise<void> => {
    const checked = dedupeLeads([lead], existing);
    duplicates.placeId += checked.duplicates.placeId;
    duplicates.address += checked.duplicates.address;
    duplicates.phone += checked.duplicates.phone;
    if (!checked.unique.length) return;
    const saved = await db.from("leads").upsert(lead, { onConflict: "google_place_id", ignoreDuplicates: true }).select("*").maybeSingle();
    if (saved.error?.code === "23505") return;
    if (saved.error) throw saved.error;
    if (!saved.data) return;
    const stored = saved.data as Lead;
    inserted.push(stored);
    if (stored.phone) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([stored.business_name, stored.address ?? stored.location].filter(Boolean).join(" "))}`;
      const queued = await db.from("call_queue").upsert({ lead_id: stored.id, maps_url: mapsUrl }, { onConflict: "lead_id", ignoreDuplicates: true });
      if (queued.error) throw queued.error;
      callQueueCount++;
    }
    log({ timestamp: new Date().toISOString(), phase: "database", level: "success", message: `Saved ${stored.business_name} immediately${stored.phone ? " and queued it for calls pending a verified email" : ""}`, current: inserted.length });
  };
  const campaign = await searchPlacesCampaign(niche, location, { mode, onLead: saveLead }, log);
  console.log(JSON.stringify({ type: "result", niche, location, mode, scraped: campaign.leads.length, inserted: inserted.length, callQueue: callQueueCount, duplicates }));
}

main().catch(error => { console.error(JSON.stringify({ type: "fatal", message: error instanceof Error ? error.message : "Cloud scraper failed" })); process.exitCode = 1; });
