import { NextRequest, NextResponse } from "next/server";
import { captureWebsiteScreenshots } from "@/lib/apis/screenshot";
import { readBusinessWebsite } from "@/lib/apis/website-research";
import { saveAuditToGoogleSheets } from "@/lib/apis/google-sheets";
import { analyzeWebsiteWithEvidence } from "@/lib/ai/gemini";
import type {
  WebsiteAuditCategory,
  WebsiteAuditImprovement,
  WebsiteAuditReport,
  WebsiteAuditScore,
} from "@/types";

export const maxDuration = 180;

const categories: WebsiteAuditCategory[] = [
  "Design",
  "User experience",
  "Mobile experience",
  "Accessibility",
  "Performance",
  "Trust signals",
  "Branding",
  "Calls to action",
];

function safeUrl(input: string): string {
  const value = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(value);
  const isLocalHost = /^(localhost|127\.0\.0\.1|::1)$/i.test(url.hostname);
  const isPrivateNetwork = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Enter a valid website URL");
  if ((isLocalHost || isPrivateNetwork) && process.env.NODE_ENV === "production") {
    throw new Error("Enter a public website URL");
  }
  return url.toString();
}

function extractJson(raw: string): Partial<WebsiteAuditReport> {
  const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) throw new Error("Vertex AI returned invalid audit JSON");
  return JSON.parse(clean.slice(start, end + 1)) as Partial<WebsiteAuditReport>;
}

function buildFallbackReport(url: string): Partial<WebsiteAuditReport> {
  return {
    companyName: new URL(url).hostname,
    executiveSummary: "",
    scores: [],
    improvements: [],
    strengths: [],
    professionalReport: "",
  };
}

function normalizeReport(raw: string, url: string): WebsiteAuditReport {
  let value: Partial<WebsiteAuditReport>;
  try {
    value = extractJson(raw);
  } catch {
    value = buildFallbackReport(url);
  }

  const rawScores = Array.isArray(value.scores) ? value.scores : [];
  const scores: WebsiteAuditScore[] = categories.map((category) => {
    const item = rawScores.find((score) => score.category === category);
    return {
      category,
      score: Math.max(0, Math.min(10, Number(item?.score) || 0)),
      finding: String(item?.finding ?? "Not assessed"),
      evidence: String(item?.evidence ?? "No evidence returned"),
    };
  });

  const improvements: WebsiteAuditImprovement[] = (Array.isArray(value.improvements) ? value.improvements : [])
    .map((item) => {
      const priority: WebsiteAuditImprovement["priority"] =
        item.priority === "High" || item.priority === "Low" ? item.priority : "Medium";
      return {
        priority,
        title: String(item.title ?? "Improvement"),
        problem: String(item.problem ?? ""),
        businessImpact: String(item.businessImpact ?? ""),
        recommendation: String(item.recommendation ?? ""),
        evidence: String(item.evidence ?? ""),
      };
    })
    .filter((item) => item.problem && item.recommendation);

  while (improvements.length < 10) {
    const index = improvements.length + 1;
    improvements.push({
      priority: index <= 3 ? "High" : index <= 7 ? "Medium" : "Low",
      title: `Additional recommendation ${index}`,
      problem: "The model returned too few distinct recommendations, so this row preserves the audit requirement.",
      businessImpact: "The audit still needs a full action plan before it can be sent to a prospect.",
      recommendation: "Review the page again and expand the client-ready recommendations with evidence from the screenshots and visible text.",
      evidence: "Generated fallback because the model returned fewer than 10 recommendations.",
    });
  }

  const calculated = Math.round(
    (scores.reduce((total, item) => total + item.score, 0) / scores.length) * 10,
  );

  return {
    url,
    companyName: String(value.companyName ?? new URL(url).hostname),
    executiveSummary: String(value.executiveSummary ?? ""),
    overallScore: calculated,
    scores,
    improvements,
    strengths: Array.isArray(value.strengths) ? value.strengths.map(String) : [],
    professionalReport: String(value.professionalReport ?? ""),
    auditedAt: new Date().toISOString(),
    savedToGoogleSheets: false,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { url?: string };
    if (!body.url) return NextResponse.json({ error: "Website URL is required" }, { status: 400 });

    const url = safeUrl(body.url);
    const [screenshots, website] = await Promise.all([
      captureWebsiteScreenshots(url).catch((error: unknown) => ({
        desktop: "",
        mobile: "",
        mimeType: "image/jpeg" as const,
        diagnostics: [error instanceof Error ? error.message : "Screenshot capture unavailable"],
      })),
      readBusinessWebsite(url).catch((error: unknown) => ({
        finalUrl: url,
        title: "",
        description: "",
        visibleText: "",
        publicEmails: [],
        publicPhones: [],
        relevantLinks: [],
        accessNote: error instanceof Error ? error.message : "Direct reader unavailable",
      })),
    ]);

    const prompt = `You are Nexus AI Website Critic. Produce a client-ready commercial website audit for ${url}. The first image is the desktop homepage and the second is the mobile homepage. Use those screenshots as primary evidence, the captured website data below, URL context, and public search.

Evidence rules:
- State only what is directly visible or verifiable. Never use might, may, could be, seems, appears, probably or likely.
- Do not claim that something is missing unless the complete screenshots or inspected page prove it.
- Every weakness and score must cite precise evidence: desktop screenshot location, mobile screenshot location, captured text, or exact URL.
- Separate visual observation from public-search context. Do not invent traffic, conversion rates, customer behaviour, accessibility compliance, load times, people or company facts.
- Explain findings in plain business language. Avoid technical jargon.

Assess exactly these categories out of 10: Design, User experience, Mobile experience, Accessibility, Performance, Trust signals, Branding, Calls to action. Performance must be assessed only from observable page weight/behaviour during browser capture and visible experience; do not invent speed metrics. Accessibility must cover visible contrast, text legibility, hierarchy, control labels and keyboard-observable issues only.

Return strict JSON only matching:
{
 "companyName":"",
 "executiveSummary":"2-4 client-ready paragraphs",
 "scores":[{"category":"Design","score":0,"finding":"plain-English finding","evidence":"specific observed evidence"}],
 "improvements":[{"priority":"High|Medium|Low","title":"","problem":"directly observed issue","businessImpact":"why this matters commercially","recommendation":"specific action","evidence":"where it was observed"}],
 "strengths":["3-6 verified strengths"],
 "professionalReport":"A polished standalone report suitable to send directly to the company, with an executive summary, strengths, risks, prioritized recommendations and conclusion."
}
Include all 8 score categories exactly once and at least 10 distinct, actionable, evidence-backed improvements.

Captured website data:
${JSON.stringify(website)}`;

    const raw = await analyzeWebsiteWithEvidence(prompt, [
      { data: screenshots.desktop || screenshots.mobile, mimeType: screenshots.mimeType },
      { data: screenshots.mobile || screenshots.desktop, mimeType: screenshots.mimeType },
    ]);

    const report = normalizeReport(raw, url);
    let saveWarning: string | undefined;
    try {
      report.savedToGoogleSheets = await saveAuditToGoogleSheets(report);
    } catch (error) {
      saveWarning = error instanceof Error ? error.message : "Google Sheets save failed";
    }

    return NextResponse.json({
      data: {
        report,
        screenshots: {
          desktop: `data:${screenshots.mimeType};base64,${screenshots.desktop}`,
          mobile: `data:${screenshots.mimeType};base64,${screenshots.mobile}`,
        },
        saveWarning,
      },
    });
  } catch (error) {
    console.error("website critic", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Website audit failed" },
      { status: 500 },
    );
  }
}
