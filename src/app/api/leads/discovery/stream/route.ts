import { NextRequest } from "next/server";
import { searchPlacesCampaign } from "@/lib/apis/google-maps-scraper";
import { getAdminClient } from "@/lib/supabase/server";
import { leads as demo } from "@/lib/demo-data";
import { isRateLimited } from "@/lib/rate-limit";
import { dedupeLeads, normalizeAddress, normalizePhone } from "@/lib/lead-identity";
import type { Lead, ScraperProgress } from "@/types";

interface DiscoveryBody { niche?: string; location?: string; mode?: "single" | "multi" }

export async function POST(req: NextRequest): Promise<Response> {
  if (isRateLimited(req.headers.get("x-forwarded-for") ?? "local", 8, 60_000)) {
    return Response.json({ error: "Discovery limit reached; wait one minute before starting another campaign" }, { status: 429 });
  }
  const body = await req.json() as DiscoveryBody;
  if (!body.niche?.trim() || !body.location?.trim()) return Response.json({ error: "Niche and location are required" }, { status: 400 });
  const niche = body.niche.trim();
  const location = body.location.trim();
  const mode = body.mode === "multi" ? "multi" : "single";
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: unknown): void => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      const progress = (event: ScraperProgress): void => send({ type: "event", event });
      void (async () => {
        try {
          const db = getAdminClient();
          const existing = { placeIds: new Set<string>(), addresses: new Set<string>(), phones: new Set<string>() };
          progress({ timestamp: new Date().toISOString(), phase: "database", level: "info", message: "Loading duplicate fingerprints from the lead database" });
          if (db) {
            for (let from = 0; ; from += 100) {
              const { data, error } = await db.from("leads").select("google_place_id,address,phone,niche,location").range(from, from + 99);
              if (error) throw error;
              for (const row of data ?? []) {
                existing.placeIds.add(row.google_place_id);
                const address = normalizeAddress(row.address), phone = normalizePhone(row.phone);
                if (address) existing.addresses.add(address);
                if (phone) existing.phones.add(phone);
              }
              if (!data || data.length < 100) break;
            }
          }
          progress({ timestamp: new Date().toISOString(), phase: "database", level: "success", message: `Loaded ${existing.placeIds.size} stored Place IDs for exclusion` });
          const data: Lead[] = [];
          const duplicates = { placeId: 0, address: 0, phone: 0 };
          let callQueueCount = 0;
          const saveLead = db ? async (lead: Lead): Promise<void> => {
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
            data.push(stored);
            if (stored.phone) {
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([stored.business_name, stored.address ?? stored.location].filter(Boolean).join(" "))}`;
              const queued = await db.from("call_queue").upsert({ lead_id: stored.id, maps_url: mapsUrl }, { onConflict: "lead_id", ignoreDuplicates: true });
              if (queued.error) throw queued.error;
              callQueueCount++;
            }
            send({ type: "lead", lead: stored });
            progress({ timestamp: new Date().toISOString(), phase: "database", level: "success", message: `Added ${stored.business_name} to Supabase${stored.phone ? " and the call queue pending a verified email" : ""}`, current: data.length });
          } : undefined;
          const campaign = await searchPlacesCampaign(niche, location, { mode, onLead: saveLead }, progress);
          if (!db) {
            const deduped = dedupeLeads(campaign.leads, existing);
            duplicates.placeId = deduped.duplicates.placeId;
            duplicates.address = deduped.duplicates.address;
            duplicates.phone = deduped.duplicates.phone;
            data.push(...(deduped.unique.length ? deduped.unique : demo.map(row => ({ ...row, niche, location }))));
          }
          progress({ timestamp: new Date().toISOString(), phase: "database", level: data.length ? "success" : "warning", message: `${campaign.leads.length} valid profiles scraped: ${data.length} added incrementally; excluded ${duplicates.placeId} stored Place IDs, ${duplicates.address} addresses and ${duplicates.phone} phone numbers${callQueueCount ? `; ${callQueueCount} added to the call queue` : ""}`, current: data.length, total: campaign.leads.length });
          progress({ timestamp: new Date().toISOString(), phase: "complete", level: "success", message: `Campaign finished: ${data.length} new leads ready`, current: data.length, total: data.length });
          send({ type: "result", payload: { data, demo: !db, meta: { mode, returned: data.length, scraped: campaign.leads.length, areas: campaign.areas, skippedExisting: duplicates.placeId, addressDuplicates: duplicates.address, phoneDuplicates: duplicates.phone, exhausted: data.length === 0 } } });
        } catch (error) {
          console.error("streaming lead discovery", error);
          const message = error instanceof Error ? error.message : "Lead discovery failed";
          progress({ timestamp: new Date().toISOString(), phase: "error", level: "error", message });
          send({ type: "error", error: message });
        } finally {
          controller.close();
        }
      })();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
}
