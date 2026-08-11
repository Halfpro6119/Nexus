import type { Lead } from "@/types";
import { generateText } from "@/lib/ai/gemini";

type DiscoverySource = "google_places" | "serper_maps";
let googleUnavailableUntil = 0;

function toLead(data: { name: string; website?: string; phone?: string; address?: string; placeId: string }, niche: string, location: string): Lead {
  return { id: crypto.randomUUID(), business_name: data.name || "Unknown business", website_url: data.website ?? null, phone: data.phone ?? null, address: data.address ?? null, google_place_id: data.placeId, niche, location, status: "Discovered", created_at: new Date().toISOString() };
}

async function searchGooglePlaces(niche: string, location: string, requestedCount: number): Promise<Lead[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("Google Places API key is not configured");
  const limit = Math.min(60, Math.max(1, requestedCount));
  const places: Array<{ id: string; displayName?: { text: string }; websiteUri?: string; nationalPhoneNumber?: string; formattedAddress?: string }> = [];
  let pageToken: string | undefined;
  do {
    const body: { textQuery: string; pageSize: number; pageToken?: string } = { textQuery: `${niche} in ${location}`, pageSize: Math.min(20, limit - places.length) };
    if (pageToken) body.pageToken = pageToken;
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber,places.formattedAddress,nextPageToken" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Places API failed (${response.status})`);
    const json = await response.json() as { places?: typeof places; nextPageToken?: string };
    places.push(...(json.places ?? [])); pageToken = json.nextPageToken;
  } while (pageToken && places.length < limit);
  return [...new Map(places.map(place => [place.id, place])).values()].slice(0, limit).map(place => toLead({ name: place.displayName?.text ?? "Unknown business", website: place.websiteUri, phone: place.nationalPhoneNumber, address: place.formattedAddress, placeId: place.id }, niche, location));
}

async function searchSerperMaps(niche: string, location: string, requestedCount: number): Promise<Lead[]> {
  const key = process.env.SERPERDEV_API_KEY;
  if (!key) throw new Error("Serper fallback is not configured; add SERPERDEV_API_KEY");
  const limit = Math.min(60, Math.max(1, requestedCount));
  const collected: Array<{ title?: string; address?: string; website?: string; phoneNumber?: string; placeId?: string; cid?: string }> = [];
  const seenPages = new Set<string>();
  for (let page = 1; collected.length < limit && page <= Math.ceil(limit / 20); page++) {
    const response = await fetch("https://google.serper.dev/maps", { method: "POST", headers: { "content-type": "application/json", "X-API-KEY": key }, body: JSON.stringify({ q: `${niche} in ${location}`, page }) });
    if (!response.ok) throw new Error(`Serper Maps API failed (${response.status})`);
    const json = await response.json() as { places?: typeof collected };
    const places = json.places ?? [];
    const signature = places.map(place => place.placeId ?? place.cid ?? place.title).join("|");
    if (!places.length || seenPages.has(signature)) break;
    seenPages.add(signature); collected.push(...places);
  }
  return [...new Map(collected.map(place => [place.placeId ?? place.cid ?? `${place.title}|${place.address}|${place.phoneNumber}`, place])).values()].slice(0, limit).map(place => {
    const stableId = place.placeId ?? (place.cid ? `serper:cid:${place.cid}` : `serper:${Buffer.from(`${place.title}|${place.address}|${place.phoneNumber}`).toString("base64url").slice(0, 80)}`);
    return toLead({ name: place.title ?? "Unknown business", website: place.website, phone: place.phoneNumber, address: place.address, placeId: stableId }, niche, location);
  });
}

async function searchPlacesWithSource(niche: string, location: string, requestedCount = 60): Promise<{ leads: Lead[]; source: DiscoverySource }> {
  if (Date.now() >= googleUnavailableUntil) {
    try {
      const leads = await searchGooglePlaces(niche, location, requestedCount);
      if (leads.length) return { leads, source: "google_places" };
      googleUnavailableUntil = Date.now() + 30_000;
    } catch (error) { googleUnavailableUntil = Date.now() + 60_000; console.warn("Google Places unavailable; switching to Serper Maps", error); }
  }
  return { leads: await searchSerperMaps(niche, location, requestedCount), source: "serper_maps" };
}

export async function searchPlaces(niche: string, location: string, requestedCount = 60): Promise<Lead[]> { return (await searchPlacesWithSource(niche, location, requestedCount)).leads; }

export async function searchPlacesCampaign(niche: string, location: string, requestedCount: number) {
  const target = Math.min(500, Math.max(1, requestedCount));
  if (target <= 60) { const result = await searchPlacesWithSource(niche, location, target); return { leads: result.leads, areas: [location], sources: [result.source] }; }
  const areaCount = Math.min(9, Math.ceil(target / 60));
  const fallback = [location, `Central ${location}`, `North ${location}`, `South ${location}`, `East ${location}`, `West ${location}`, `Northeast ${location}`, `Northwest ${location}`, `Southeast ${location}`].slice(0, areaCount);
  const raw = await generateText(`Return a strict JSON array of exactly ${areaCount} distinct, real geographic subareas that collectively cover ${location}. Use names suitable for local business searches. Include the original location only if it improves coverage. No commentary.`, JSON.stringify(fallback));
  let areas = fallback;
  try { const parsed = JSON.parse(raw.replace(/^```json|```$/g, "").trim()) as unknown; if (Array.isArray(parsed)) { const valid = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 1); if (valid.length) areas = [...new Set(valid)].slice(0, areaCount); } } catch {}
  const batches: Lead[][] = []; const sources = new Set<DiscoverySource>();
  for (const area of areas) { const result = await searchPlacesWithSource(niche, area, 60); batches.push(result.leads); sources.add(result.source); if (new Set(batches.flat().map(lead => lead.google_place_id)).size >= target) break; }
  const campaignLeads = [...new Map(batches.flat().map(lead => [lead.google_place_id, { ...lead, location }])).values()].slice(0, target);
  return { leads: campaignLeads, areas, sources: [...sources] };
}
