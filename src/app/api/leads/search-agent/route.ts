import { NextRequest, NextResponse } from "next/server";
import { generateSearchAgentJson } from "@/lib/ai/gemini";
import { getAdminClient } from "@/lib/supabase/server";
import { leads as demoLeads } from "@/lib/demo-data";
import type {
  ScraperProgress,
  SearchAgentMessage,
  SearchAgentQuestion,
  SearchAgentRecommendation,
  SearchAgentReport,
} from "@/types";

type LeadRow = { niche: string; location: string; website_url: string | null; phone: string | null };
type AgentContext = SearchAgentReport["context"];
type AgentModelResponse = {
  reply?: unknown;
  context?: unknown;
  awaitingReply?: unknown;
  nextQuestion?: unknown;
  recommendations?: unknown;
  bestNiche?: unknown;
  bestLocation?: unknown;
  bestSearch?: unknown;
  summary?: unknown;
};
type RequestHistory = Array<{ role?: string; content?: string }>;

const questions: SearchAgentQuestion[] = [
  { id: "service", question: "What service are you selling?", placeholder: "Website design, lead generation, SEO, ads...", defaultValue: "" },
  { id: "idealCustomer", question: "Who is the ideal customer you want most?", placeholder: "Dentists, law firms, trades, clinics...", defaultValue: "" },
  { id: "locations", question: "Which locations do you want to focus on?", placeholder: "London, Manchester, UK-wide, counties...", defaultValue: "" },
  { id: "goal", question: "What outcome matters most?", placeholder: "More calls, booked meetings, or high-value retainers", defaultValue: "" },
];

const now = (): string => new Date().toISOString();
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function message(role: "assistant" | "user", content: string): SearchAgentMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: now() };
}

function parseJson(raw: string): AgentModelResponse | null {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(stripped);
    return object(parsed) as AgentModelResponse | null;
  } catch {
    return null;
  }
}

function normalizeContext(value: unknown, fallback: AgentContext): AgentContext {
  const candidate = object(value);
  return {
    service: text(candidate?.service) || fallback.service,
    idealCustomer: text(candidate?.idealCustomer) || fallback.idealCustomer,
    locations: text(candidate?.locations) || fallback.locations,
    goal: text(candidate?.goal) || fallback.goal,
  };
}

function questionFor(value: unknown, context: AgentContext): SearchAgentQuestion | undefined {
  const candidate = object(value);
  const id = text(candidate?.id);
  const known = questions.find((question) => question.id === id);
  if (known && !context[known.id as keyof AgentContext]) return known;
  return questions.find((question) => !context[question.id as keyof AgentContext]);
}

function scoreGroup(service: string, niche: string, location: string, rows: LeadRow[]): SearchAgentRecommendation {
  const leadCount = rows.length;
  const websiteRate = leadCount ? rows.filter((row) => Boolean(row.website_url?.trim())).length / leadCount : 0;
  const phoneRate = leadCount ? rows.filter((row) => Boolean(row.phone?.trim())).length / leadCount : 0;
  const terms = service.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const boost = terms.filter((term) => `${niche} ${location}`.toLowerCase().includes(term)).length * 18;
  const score = Math.max(0, Math.min(100, Math.round(Math.min(65, leadCount * 3.5) + (1 - websiteRate) * 15 + phoneRate * 8 + boost)));
  return {
    niche,
    location,
    score,
    reason: `${leadCount} leads in your database; ${websiteRate < 0.5 ? "a high share need a stronger online presence" : "a solid mix have websites"}; ${phoneRate > 0.6 ? "good calling coverage" : "mixed contact coverage"}.`,
    firstSearch: `${niche} in ${location}`,
    leadCount,
    websiteRate: Math.round(websiteRate * 100) / 100,
    phoneRate: Math.round(phoneRate * 100) / 100,
  };
}

function coerceRecommendations(value: unknown, fallback: SearchAgentRecommendation[]): SearchAgentRecommendation[] {
  if (!Array.isArray(value)) return fallback;
  const allowed = new Map(fallback.map((item) => [`${item.niche.toLowerCase()}|${item.location.toLowerCase()}`, item]));
  const selected: SearchAgentRecommendation[] = [];
  for (const item of value) {
    const candidate = object(item);
    const niche = text(candidate?.niche);
    const location = text(candidate?.location);
    const existing = allowed.get(`${niche.toLowerCase()}|${location.toLowerCase()}`);
    if (!existing || selected.some((entry) => entry.niche === existing.niche && entry.location === existing.location)) continue;
    selected.push({ ...existing, reason: text(candidate?.reason) || existing.reason });
  }
  return selected.length ? selected : fallback;
}

function fallbackReply(context: AgentContext, history: RequestHistory): { reply: string; nextQuestion?: SearchAgentQuestion; awaitingReply: boolean } {
  const nextQuestion = questions.find((question) => !context[question.id as keyof AgentContext]);
  if (nextQuestion) {
    const hasConversation = history.some((entry) => entry.role === "user" && text(entry.content));
    return {
      reply: hasConversation
        ? `Thanks - I have that. To make the recommendation useful, ${nextQuestion.question.charAt(0).toLowerCase()}${nextQuestion.question.slice(1)}`
        : "Tell me what you sell and I will turn the conversation into a focused search plan.",
      nextQuestion,
      awaitingReply: true,
    };
  }
  return { reply: "I have enough context to build a target-market recommendation from your lead data.", awaitingReply: false };
}

async function loadRows(terminal: ScraperProgress[]): Promise<LeadRow[]> {
  const fallback = demoLeads.map((lead) => ({ niche: lead.niche, location: lead.location, website_url: lead.website_url, phone: lead.phone }));
  const db = getAdminClient();
  if (!db) return fallback;
  const { data, error } = await db.from("leads").select("niche,location,website_url,phone").limit(500);
  if (error) return fallback;
  const rows = (data ?? []).filter((row): row is LeadRow => Boolean(row.niche?.trim()) && Boolean(row.location?.trim()));
  terminal.push({ timestamp: now(), phase: "database", level: "success", message: `Loaded ${rows.length} lead rows from Supabase.` });
  return rows;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { service?: string; idealCustomer?: string; locations?: string; goal?: string; history?: RequestHistory };
    const initialContext: AgentContext = {
      service: text(body.service),
      idealCustomer: text(body.idealCustomer),
      locations: text(body.locations),
      goal: text(body.goal),
    };
    const history = (body.history ?? []).filter((entry) => (entry.role === "user" || entry.role === "assistant") && Boolean(text(entry.content))).slice(-16);
    const terminal: ScraperProgress[] = [{ timestamp: now(), phase: "campaign", level: "info", message: "Search Agent is reading conversation context." }];
    const rows = await loadRows(terminal);
    const groups = new Map<string, LeadRow[]>();
    for (const row of rows) {
      const key = `${row.niche.toLowerCase()}|${row.location.toLowerCase()}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const fallbackRecommendations = [...groups.values()]
      .map((group) => scoreGroup(initialContext.service, group[0]?.niche ?? "", group[0]?.location ?? "", group))
      .sort((a, b) => b.score - a.score || b.leadCount - a.leadCount)
      .slice(0, 6);
    const compactSegments = fallbackRecommendations.map((item) => ({ niche: item.niche, location: item.location, score: item.score, leadCount: item.leadCount, websiteRate: item.websiteRate, phoneRate: item.phoneRate }));
    const prompt = `You are Nexus Search Agent, a consultative B2B market-selection assistant. Hold a natural conversation. Read the full history and extract information the user has already supplied, even if it is phrased casually. Never repeat a question that the history or current context already answers. Ask at most one concise follow-up only when a missing field materially changes the targeting plan. Once you have service, target customer, location/scope, and commercial goal, give a useful recommendation rather than more questions. Use the supplied database segments as evidence; do not invent segment names or data.\n\nReturn JSON only with this exact shape:\n{\"reply\":string,\"context\":{\"service\":string,\"idealCustomer\":string,\"locations\":string,\"goal\":string},\"awaitingReply\":boolean,\"nextQuestion\":{\"id\":\"service\"|\"idealCustomer\"|\"locations\"|\"goal\"}|null,\"summary\":string,\"bestNiche\":string,\"bestLocation\":string,\"bestSearch\":string,\"recommendations\":[{\"niche\":string,\"location\":string,\"reason\":string}]}\n\nKnown context: ${JSON.stringify(initialContext)}\nConversation: ${JSON.stringify(history)}\nDatabase segments: ${JSON.stringify(compactSegments)}`;

    let model: AgentModelResponse | null = null;
    try {
      model = parseJson(await generateSearchAgentJson(prompt));
      terminal.push({ timestamp: now(), phase: "campaign", level: "success", message: "Gemini returned a structured targeting response." });
    } catch (error) {
      terminal.push({ timestamp: now(), phase: "campaign", level: "warning", message: "Gemini is unavailable; using the local targeting fallback." });
      console.warn("Search Agent Gemini fallback", error);
    }

    const context = normalizeContext(model?.context, initialContext);
    const fallback = fallbackReply(context, history);
    const nextQuestion = questionFor(model?.nextQuestion, context) ?? fallback.nextQuestion;
    const awaitingReply = typeof model?.awaitingReply === "boolean" ? model.awaitingReply && Boolean(nextQuestion) : fallback.awaitingReply;
    const recommendations = coerceRecommendations(model?.recommendations, fallbackRecommendations);
    const selectedBest = recommendations[0] ?? fallbackRecommendations[0];
    const bestNiche = text(model?.bestNiche) || selectedBest?.niche || context.idealCustomer;
    const bestLocation = text(model?.bestLocation) || selectedBest?.location || context.locations;
    const bestSearch = text(model?.bestSearch) || selectedBest?.firstSearch || `${bestNiche} in ${bestLocation}`;
    const reply = text(model?.reply) || fallback.reply;
    const summary = text(model?.summary) || reply;
    const messages = [...history.map((entry) => message(entry.role === "assistant" ? "assistant" : "user", text(entry.content))), message("assistant", reply)];
    terminal.push({ timestamp: now(), phase: "complete", level: "success", message: awaitingReply ? "Conversation context saved. Waiting for one useful answer." : "Structured targeting plan ready." });

    const report: SearchAgentReport = { service: context.service, summary, recommendations, bestNiche, bestLocation, bestSearch, terminal, questions, context, messages, awaitingReply, nextQuestion };
    return NextResponse.json({ data: report });
  } catch (error) {
    console.error("search agent", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Search Agent failed to analyze your lead data." }, { status: 500 });
  }
}
