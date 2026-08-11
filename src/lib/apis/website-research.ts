export interface WebsiteEvidence {
  finalUrl: string;
  title: string;
  description: string;
  visibleText: string;
  publicEmails: string[];
  publicPhones: string[];
  relevantLinks: string[];
  accessNote?: string;
}

function decode(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export async function readBusinessWebsite(url: string): Promise<WebsiteEvidence> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; NexusResearch/1.0; +business-website-audit)" },
  });
  if (!response.ok) return { finalUrl: response.url || url, title: "", description: "", visibleText: "", publicEmails: [], publicPhones: [], relevantLinks: [], accessNote: `Direct reader was blocked with HTTP ${response.status}; use URL context, screenshot and public search instead.` };
  const html = await response.text();
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
  const description = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] ?? "");
  const withoutNoise = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  const visibleText = decode(withoutNoise.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 30_000);
  const publicEmails = [...new Set((html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map(value => value.toLowerCase()).filter(value => !value.endsWith("@sentry.io")))].slice(0, 10);
  const publicPhones = [...new Set((visibleText.match(/(?:\+?\d[\d ()-]{8,}\d)/g) ?? []).map(value => value.trim()))].slice(0, 10);
  const relevantLinks = [...new Set([...html.matchAll(/href=["']([^"']+)["']/gi)].map(match => match[1]).filter(link => /about|team|people|contact|linkedin/i.test(link)))].slice(0, 20);
  return { finalUrl: response.url, title, description, visibleText, publicEmails, publicPhones, relevantLinks, ...(visibleText.length < 100 ? { accessNote: "The page exposed very little readable text; rely on screenshot, URL context and public search." } : {}) };
}
