import type { Browser, Page } from "playwright";
import type { Lead, ScraperProgress } from "../../types";
import { normalizeAddress, normalizePhone } from "../lead-identity";
import { generateText } from "../ai/gemini";

const RESULT_LINK = "a.hfpxzc";
const END_MARKERS = ["You've reached the end of the list", "You've reached the end", "No more results"];
type ProgressReporter = (event: ScraperProgress) => void;
type LeadReporter = (lead: Lead) => Promise<void>;
export type ScraperMode = "single" | "multi";
export interface ScraperOptions { mode: ScraperMode; onLead?: LeadReporter }

function report(reporter: ProgressReporter | undefined, event: Omit<ScraperProgress, "timestamp">): void {
  reporter?.({ ...event, timestamp: new Date().toISOString() });
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(1, Math.round(parsed))) : fallback;
}

function cleanField(value: string | null, labels: string[]): string | null {
  if (!value) return null;
  let cleaned = value.replace(/\s+/g, " ").trim();
  for (const label of labels) cleaned = cleaned.replace(new RegExp(`^${label}\\s*:?\\s*`, "i"), "");
  return cleaned || null;
}

async function dismissConsent(page: Page): Promise<void> {
  const choices = [
    "button:has-text('Reject all')",
    "button:has-text('Accept all')",
    "button:has-text('I agree')",
    "button#L2AGLb",
  ];
  for (const selector of choices) {
    const button = page.locator(selector).first();
    if (await button.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await button.scrollIntoViewIfNeeded().catch(() => undefined);
      await button.click({ timeout: 3_000 }).catch(() => undefined);
      await page.waitForTimeout(750);
      return;
    }
  }
}

async function gotoWithRetry(page: Page, url: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await page.waitForTimeout(500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function speedUpPage(page: Page): Promise<void> {
  await page.route("**/*", route => {
    const type = route.request().resourceType();
    if (["image", "media", "font"].includes(type)) void route.abort();
    else void route.continue();
  });
}

async function reachedEndOfResults(page: Page): Promise<boolean> {
  for (const marker of END_MARKERS) {
    if (await page.getByText(marker, { exact: false }).count()) return true;
  }
  return false;
}

async function collectResultLinks(page: Page, query: string, target: number, reporter?: ProgressReporter, shard?: number): Promise<string[]> {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query).replace(/%20/g, "+")}?hl=en`;
  await gotoWithRetry(page, url);
  await dismissConsent(page);
  await page.locator(RESULT_LINK).first().waitFor({ state: "attached", timeout: 20_000 });
  const links = new Set<string>();
  const maximumScrolls = positiveInteger(process.env.MAPS_SCRAPER_MAX_SCROLLS, 600, 2_000);
  const scrollDelay = positiveInteger(process.env.MAPS_SCRAPER_SCROLL_DELAY_MS, 550, 5_000);
  let stablePasses = 0;
  let previousHeight = 0;
  for (let pass = 0; pass < maximumScrolls && links.size < target; pass++) {
    const before = links.size;
    for (const href of await page.locator(RESULT_LINK).evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).href))) {
      if (href) links.add(href);
    }
    if (await reachedEndOfResults(page)) break;
    const feed = page.locator('[role="feed"]').first();
    let currentHeight = 0;
    if (await feed.count()) {
      currentHeight = await feed.evaluate(element => {
        element.scrollTo(0, element.scrollHeight);
        return element.scrollHeight;
      });
    } else {
      const resultCount = await page.locator(RESULT_LINK).count();
      if (resultCount) await page.locator(RESULT_LINK).nth(resultCount - 1).scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(scrollDelay + Math.floor(Math.random() * 250));
    const grew = links.size > before || currentHeight > previousHeight;
    stablePasses = grew ? 0 : stablePasses + 1;
    previousHeight = Math.max(previousHeight, currentHeight);
    // A slow network can produce several unchanged passes. Require a sustained
    // stable feed before treating it as exhausted.
    if (grew && (pass === 0 || pass % 5 === 0)) report(reporter, { phase: "shard", level: "info", message: `${query}: ${links.size} candidate links loaded`, shard, current: links.size, total: target });
    if (!grew && stablePasses > 0 && stablePasses % 4 === 0) report(reporter, { phase: "shard", level: "info", message: `${query}: waiting for more results (${stablePasses}/12 stability checks)`, shard, current: links.size, total: target });
    if (stablePasses >= 12) break;
  }
  for (const href of await page.locator(RESULT_LINK).evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).href))) {
    if (href) links.add(href);
  }
  return [...links].slice(0, target);
}

function buildSearchShards(niche: string, location: string, count: number): string[] {
  return [
    `${niche} in ${location}`,
    `${niche} in North ${location}`,
    `${niche} in South ${location}`,
    `${niche} in East ${location}`,
    `${niche} in West ${location}`,
  ].slice(0, count);
}

async function discoverProminentAreas(location: string, reporter?: ProgressReporter): Promise<string[]> {
  const areaCount = positiveInteger(process.env.MAPS_SCRAPER_MULTI_AREAS, 6, 20);
  const fallback = Array.from({ length: areaCount }, (_, index) => index === 0 ? location : `${["Central", "North", "South", "East", "West"][((index - 1) % 5)]} ${location}`);
  report(reporter, { phase: "campaign", level: "info", message: `Identifying ${areaCount} prominent areas within ${location} for the search queue` });
  const response = await generateText(`Return only a strict JSON array of ${areaCount} distinct prominent populated areas within ${location}. Use real city, borough, town, district or county names suitable for Google Maps local-business searches. Cover the scope geographically and do not include commentary.`, JSON.stringify(fallback));
  try {
    const parsed = JSON.parse(response.replace(/^```json|```$/g, "").trim()) as unknown;
    if (Array.isArray(parsed)) {
      const areas = [...new Set(parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 1).map(value => value.trim()))].slice(0, areaCount);
      if (areas.length) return areas;
    }
  } catch {}
  return fallback;
}

function mergeShardLinks(shards: string[][], limit: number): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...shards.map(shard => shard.length));
  for (let index = 0; index < longest && merged.length < limit; index++) {
    for (const shard of shards) {
      const link = shard[index];
      if (link && !seen.has(link)) {
        seen.add(link);
        merged.push(link);
        if (merged.length >= limit) break;
      }
    }
  }
  return merged;
}

async function collectSearchShards(browser: Browser, niche: string, location: string, reporter?: ProgressReporter): Promise<{ links: string[][]; queries: string[] }> {
  const shardCount = positiveInteger(process.env.MAPS_SCRAPER_SEARCH_SHARDS, 5, 5);
  const linksPerShard = positiveInteger(process.env.MAPS_SCRAPER_MAX_LINKS_PER_SHARD, 2_000, 5_000);
  const queries = buildSearchShards(niche, location, shardCount);
  const links = await Promise.all(queries.map(async (query, index) => {
    report(reporter, { phase: "shard", level: "info", message: `Shard ${index + 1} launched: ${query}`, shard: index + 1, current: 0, total: linksPerShard });
    const context = await browser.newContext({ locale: "en-GB", viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await speedUpPage(page);
    try {
      const result = await collectResultLinks(page, query, linksPerShard, reporter, index + 1);
      report(reporter, { phase: "shard", level: "success", message: `Shard ${index + 1} finished with ${result.length} candidates`, shard: index + 1, current: result.length, total: result.length });
      return result;
    } catch (error) {
      console.warn("Google Maps search shard failed", { query, error });
      report(reporter, { phase: "shard", level: "warning", message: `Shard ${index + 1} failed; remaining shards will continue`, shard: index + 1 });
      return [];
    } finally {
      await context.close();
    }
  }));
  return { links, queries };
}

async function firstText(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const value = await page.locator(selector).first().textContent({ timeout: 1_500 }).catch(() => null);
    if (value?.trim()) return value.trim();
  }
  return null;
}

async function scrapeBusiness(page: Page, url: string, niche: string, location: string): Promise<Lead | null> {
  await gotoWithRetry(page, url);
  await dismissConsent(page);
  const businessName = await firstText(page, ["h1.DUwDvf", "h1.fontHeadlineLarge", "h1"]);
  if (!businessName || businessName.toLowerCase() === "results") return null;
  const address = cleanField(await firstText(page, ['button[data-item-id="address"] .Io6YTe', 'button[data-item-id="address"]', '[data-tooltip="Copy address"]']), ["address"]);
  const phone = cleanField(await firstText(page, ['button[data-item-id^="phone:"] .Io6YTe', 'button[data-item-id*="phone"]', '[data-tooltip="Copy phone number"]']), ["phone", "telephone"]);
  const rawWebsite = await page.locator('a[data-item-id="authority"]').first().getAttribute("href", { timeout: 1_500 }).catch(() => null);
  const website = rawWebsite && /^https?:\/\//i.test(rawWebsite) ? rawWebsite : null;
  if (!address && !phone && !website) return null;
  const placeMatch = url.match(/!1s([^!/?]+)/) ?? url.match(/place\/([^/?]+)/);
  const placeId = placeMatch?.[1] ? decodeURIComponent(placeMatch[1]) : Buffer.from(`${businessName}|${address ?? ""}|${phone ?? ""}`).toString("base64url").slice(0, 100);
  return {
    id: crypto.randomUUID(),
    business_name: businessName,
    website_url: website,
    phone,
    address,
    google_place_id: `gms:${placeId}`,
    niche,
    location,
    status: "Discovered",
    created_at: new Date().toISOString(),
  };
}

async function scrapeLinks(browser: Browser, links: string[], niche: string, location: string, reporter?: ProgressReporter, onLead?: LeadReporter): Promise<Lead[]> {
  const concurrency = positiveInteger(process.env.MAPS_SCRAPER_CONCURRENCY, 4, 8);
  const detailAttempts = positiveInteger(process.env.MAPS_SCRAPER_DETAIL_RETRIES, 2, 4);
  const results: Array<{ index: number; lead: Lead }> = [];
  const addresses = new Set<string>();
  const phones = new Set<string>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, links.length) }, async () => {
    const context = await browser.newContext({ locale: "en-GB", viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await speedUpPage(page);
    while (cursor < links.length) {
      const index = cursor++;
      let lead: Lead | null = null;
      for (let attempt = 0; attempt < detailAttempts && !lead; attempt++) {
        lead = await scrapeBusiness(page, links[index], niche, location).catch(error => {
          if (attempt === detailAttempts - 1) console.warn("Google Maps business scrape failed", { url: links[index], error });
          return null;
        });
        if (!lead && attempt < detailAttempts - 1) await page.waitForTimeout(400 * (attempt + 1));
      }
      if (lead) {
        const address = normalizeAddress(lead.address);
        const phone = normalizePhone(lead.phone);
        const duplicate = Boolean((address && addresses.has(address)) || (phone && phones.has(phone)));
        if (!duplicate) {
          if (address) addresses.add(address);
          if (phone) phones.add(phone);
          results.push({ index, lead });
          await onLead?.(lead);
          report(reporter, { phase: "profile", level: "success", message: `Captured ${lead.business_name}`, current: results.length, total: links.length });
        }
      }
    }
    await context.close();
  }));
  return results.sort((a, b) => a.index - b.index).map(result => result.lead);
}

export async function searchPlacesCampaign(niche: string, location: string, requestedCountOrOptions: number | ScraperOptions, reporter?: ProgressReporter) {
  const legacyTarget = typeof requestedCountOrOptions === "number" ? Math.min(500, Math.max(1, requestedCountOrOptions)) : undefined;
  const mode: ScraperMode = typeof requestedCountOrOptions === "number" ? "single" : requestedCountOrOptions.mode;
  if (process.env.VERCEL === "1") {
    const { dispatchCloudRunScraper } = await import("./cloud-run-scraper");
    report(reporter, { phase: "campaign", level: "info", message: "Vercel deployment detected: dispatching the Nexus scraper to Cloud Run." });
    const execution = await dispatchCloudRunScraper(niche, location, mode);
    report(reporter, { phase: "campaign", level: "success", message: `Cloud Run job queued: ${execution}. New leads will appear in Supabase as they are captured.` });
    return { leads: [], areas: [location], sources: ["cloud_run_job"], mode };
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const areas = mode === "multi" ? await discoverProminentAreas(location, reporter) : [location];
    const allShardLinks: string[][] = [];
    const queries: string[] = [];
    report(reporter, { phase: "campaign", level: "info", message: `Launching ${mode} campaign with ${areas.length} queued area${areas.length === 1 ? "" : "s"}` });
    for (let index = 0; index < areas.length; index++) {
      report(reporter, { phase: "campaign", level: "info", message: `Queue ${index + 1}/${areas.length}: searching ${areas[index]}`, current: index + 1, total: areas.length });
      const shardResults = await collectSearchShards(browser, niche, areas[index], reporter);
      allShardLinks.push(...shardResults.links);
      queries.push(...shardResults.queries);
    }
    const collectionTarget = legacyTarget ? Math.min(500, Math.max(legacyTarget, Math.ceil(legacyTarget * 1.2))) : Number.MAX_SAFE_INTEGER;
    const links = mergeShardLinks(allShardLinks, collectionTarget);
    report(reporter, { phase: "merge", level: "info", message: `Merged shards into ${links.length} unique profile candidates`, current: links.length, total: collectionTarget });
    if (!links.length) throw new Error("Google Maps returned no business links; consent or bot protection may be blocking the scraper");
    const leads = await scrapeLinks(browser, links, niche, location, reporter, typeof requestedCountOrOptions === "number" ? undefined : requestedCountOrOptions.onLead);
    report(reporter, { phase: "complete", level: "success", message: `Scraper completed with ${leads.length} validated profiles`, current: leads.length, total: leads.length });
    return { leads: legacyTarget ? leads.slice(0, legacyTarget) : leads, areas: queries, sources: ["local_playwright"], mode };
  } finally {
    await browser.close();
  }
}
