import { NextRequest, NextResponse } from "next/server";
import { readBusinessWebsite } from "@/lib/apis/website-research";
import { captureLeanWebsiteScreenshots } from "@/lib/apis/screenshot";
import { getAdminClient } from "@/lib/supabase/server";
import { leads } from "@/lib/demo-data";
import { analyzeLeadWithGrounding } from "@/lib/ai/gemini";
import type { DecisionMaker, Lead, LeadEnrichment } from "@/types";

interface BusinessResearch {
  website_audit_notes: string;
  visual_design_flaws: string[];
  business_insights: string[];
  decision_makers: DecisionMaker[];
  value_proposition_angle: string;
}

const legacyMockAudit = "The website has a weak above-the-fold CTA and an unclear conversion path.";

function parseResearch(raw: string): BusinessResearch {
  const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The research model did not return a usable report");
  const result = JSON.parse(clean.slice(start, end + 1)) as Partial<BusinessResearch>;
  if (!result.website_audit_notes || !result.value_proposition_angle || !result.business_insights?.length || !result.visual_design_flaws?.length) {
    throw new Error("The research report was incomplete");
  }
  const leadLeaks = result.visual_design_flaws.map(item => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const value = item as Record<string, unknown>;
      return [value["What is happening"], value["Why it loses customers"], value["A practical improvement"]].filter(part => typeof part === "string").join(" — ");
    }
    return "";
  }).filter(Boolean);
  const insights = result.business_insights.map(item => typeof item === "string" ? item : JSON.stringify(item)).filter(Boolean);
  return {
    website_audit_notes: result.website_audit_notes,
    visual_design_flaws: leadLeaks,
    business_insights: insights,
    decision_makers: Array.isArray(result.decision_makers) ? result.decision_makers : [],
    value_proposition_angle: result.value_proposition_angle,
  };
}

async function researchLead(lead: Lead) {
  if (!lead.website_url) throw new Error(`${lead.business_name} has no website to audit`);
  const [site, screenshots] = await Promise.all([
    readBusinessWebsite(lead.website_url).catch(error => ({ finalUrl: lead.website_url!, title: "", description: "", visibleText: "", publicEmails: [], publicPhones: [], relevantLinks: [], accessNote: `Direct website reader failed: ${error instanceof Error ? error.message : "unknown error"}` })),
    captureLeanWebsiteScreenshots(lead.website_url),
  ]);
  const leanEvidence = { finalUrl: site.finalUrl, title: site.title, description: site.description, visibleText: site.visibleText.slice(0, 8_000), publicEmails: site.publicEmails.slice(0, 5), publicPhones: site.publicPhones.slice(0, 5), relevantLinks: site.relevantLinks.slice(0, 10), accessNote: site.accessNote };
  const prompt = `You are Nexus, a cost-efficient lead qualification researcher. Produce a concise, factual sales brief for ${lead.business_name}, located at ${lead.address ?? lead.location}. Website: ${site.finalUrl}.

Use the supplied website text, the first compressed image showing the desktop first viewport, the second compressed image showing the mobile first viewport, URL context, and one focused public search pass to identify only what is needed for relevant outreach:
- what the business sells, who its ideal customers are, its location/coverage, differentiators, reputation and likely commercial goals;
- the visitor journey and the specific points where prospective customers may hesitate, abandon the page, or fail to enquire;
- named owners, founders, directors, practice managers, marketing leaders or other relevant decision-makers and their PUBLIC contact details.

Write for a busy business owner. Do not mention PageSpeed, Core Web Vitals, SEO jargon, UX jargon, technical scores, pixels, code, schemas or abstract best practices. Explain each weakness as a commercial consequence, e.g. “Visitors cannot quickly see whether you treat nervous patients, so they may return to Google and choose a competitor.” Be specific to evidence on this business and never use generic filler.

Contact integrity rules: never infer, pattern-generate or guess an email. Include an email or phone only when it appears in a public source. Name the exact source page or public profile in source. If a person is found without a verified direct contact, include them with email "" and provide a LinkedIn/profile URL when available. Do not present the general business number as a person's direct number.

Evidence integrity rules: report a website weakness only when directly verified in the desktop screenshot, mobile screenshot, captured page text or URL context. Never use “might”, “may”, “could be”, “appears”, “likely”, or speculative wording. Omit anything uncertain. Cite the exact screenshot region, page or captured text for every lead leak. Public reviews cannot prove that website content is absent.

Mobile check: explicitly inspect whether the 390px mobile screenshot has readable text, usable navigation, content fitting the viewport, an obvious next action, and no overlap, clipping or desktop-only layout. Include a mobile weakness only when visible. If the mobile experience is sound, record that as a verified business insight rather than inventing a problem.

Availability check: treat the supplied browser diagnostics as verified evidence. If either desktop or mobile returned an HTTP error, timed out, had no response, showed an error/parked-domain title, or contained almost no readable content, make website availability the first and highest-priority lead leak. State exactly what failed and on which viewport. Do not describe the site as healthy when browser diagnostics say otherwise.

Return strict JSON only:
{
  "website_audit_notes":"At most 2 short paragraphs: what they sell, who they serve, their strongest differentiator and the clearest verified enquiry opportunity.",
  "visual_design_flaws":["Exactly 3 highest-value verified lead leaks, formatted: Evidence and source — Commercial consequence — Practical improvement"],
  "business_insights":["4-6 essential facts only: offer, customer, geography, differentiation, proof and priority; include source inline"],
  "decision_makers":[{"name":"","title":"","email":"","phone":"","linkedin":"","source":"exact public source URL or page name","confidence":"High or Medium"}],
  "value_proposition_angle":"A short, specific outreach angle describing the business outcome Nexus could help create without insulting the owner"
}

Website evidence captured directly from the live page:
${JSON.stringify({...leanEvidence,browserDiagnostics:screenshots.diagnostics??[]})}`;
  const images = [screenshots.desktop, screenshots.mobile].filter(Boolean).map(data => ({ data, mimeType: screenshots.mimeType }));
  const raw = await analyzeLeadWithGrounding(prompt, images, "");
  if (!raw) throw new Error("AI research is unavailable; check the Gemini API configuration");
  const audit = parseResearch(raw);
  if (screenshots.diagnostics?.length) {
    audit.visual_design_flaws = [`Website availability failure — ${screenshots.diagnostics.join(" ")} — Restore reliable desktop and mobile access before spending money driving visitors to the site.`, ...audit.visual_design_flaws.filter(item => !/availability|failed to load|http \d{3}/i.test(item))].slice(0, 3);
  }
  const decisionMakers = [...new Map(audit.decision_makers.map(person => [`${person.name.toLowerCase()}|${person.email.toLowerCase()}`, person])).values()];
  return {
    lead_id: lead.id,
    pagespeed_score: 0,
    pagespeed_issues: audit.business_insights,
    website_audit_notes: audit.website_audit_notes,
    visual_design_flaws: audit.visual_design_flaws,
    decision_makers: decisionMakers,
    value_proposition_angle: audit.value_proposition_angle,
    updated_at: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const db = getAdminClient();
    if (!db) return NextResponse.json({ data: [], configurationRequired: true });
    const rows: unknown[] = [];
    for (let from = 0; ; from += 100) {
      const { data, error } = await db.from("lead_enrichments").select("*").order("updated_at", { ascending: false }).range(from, from + 99);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 100) break;
    }
    return NextResponse.json({ data: rows.filter(row => {
      if (!row || typeof row !== "object") return false;
      return (row as { website_audit_notes?: string }).website_audit_notes !== legacyMockAudit;
    }) });
  } catch (error) {
    console.error("load enrichments", error);
    return NextResponse.json({ error: "Research records could not be loaded" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { leadIds, force = false } = await req.json() as { leadIds?: string[]; force?: boolean };
    if (!leadIds?.length || leadIds.length > 10) return NextResponse.json({ error: "Select between 1 and 10 leads" }, { status: 400 });
    const db = getAdminClient();
    let targets = leads.filter(lead => leadIds.includes(lead.id));
    const cached: LeadEnrichment[] = [];
    if (db) {
      const { data, error } = await db.from("leads").select("*").in("id", leadIds);
      if (error) throw error;
      targets = (data ?? []) as Lead[];
      if (!force) {
        const freshAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: existing, error: cacheError } = await db.from("lead_enrichments").select("*").in("lead_id", leadIds).gte("updated_at", freshAfter);
        if (cacheError) throw cacheError;
        cached.push(...((existing ?? []) as LeadEnrichment[]).filter(record => record.website_audit_notes !== legacyMockAudit));
        const cachedIds = new Set(cached.map(record => record.lead_id));
        targets = targets.filter(lead => !cachedIds.has(lead.id));
      }
    }
    const outputs = [];
    const failures: Array<{ leadId: string; businessName: string; error: string }> = [];
    for (const lead of targets) {
      try { outputs.push(await researchLead(lead)); }
      catch (error) { failures.push({ leadId: lead.id, businessName: lead.business_name, error: error instanceof Error ? error.message : "Research failed" }); }
    }
    if (db && outputs.length) {
      const completedIds = outputs.map(output => output.lead_id);
      const { error: deleteError } = await db.from("lead_enrichments").delete().in("lead_id", completedIds);
      if (deleteError) throw deleteError;
      const { error } = await db.from("lead_enrichments").insert(outputs);
      if (error) throw error;
      await db.from("leads").update({ status: "Enriched" }).in("id", completedIds);
      const targetsById = new Map(targets.map(lead => [lead.id, lead]));
      for (const output of outputs) {
        const hasVerifiedEmail = output.decision_makers.some(person => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim()) && person.source.trim().length > 3);
        if (hasVerifiedEmail) {
          const { error: queueError } = await db.from("call_queue").delete().eq("lead_id", output.lead_id);
          if (queueError) throw queueError;
        } else {
          const lead = targetsById.get(output.lead_id);
          if (lead?.phone) {
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([lead.business_name, lead.address ?? lead.location].filter(Boolean).join(" "))}`;
            const { error: queueError } = await db.from("call_queue").upsert({ lead_id: lead.id, maps_url: mapsUrl }, { onConflict: "lead_id", ignoreDuplicates: true });
            if (queueError) throw queueError;
          }
        }
      }
    }
    const completed = [...cached, ...outputs];
    if (!completed.length) return NextResponse.json({ error: failures[0]?.error ?? "No research could be completed", failures }, { status: 422 });
    return NextResponse.json({ data: completed, failures, cached: cached.length });
  } catch (error) {
    console.error("lead enrichment", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Research pipeline could not complete" }, { status: 500 });
  }
}
