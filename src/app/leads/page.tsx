"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Globe2,
  MapPin,
  PhoneCall,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { readCachedValue, writeCachedValue } from "@/lib/client-cache";
import { leads as seed } from "@/lib/demo-data";
import type { Lead, LeadStatus, ScraperProgress, SearchAgentMessage, SearchAgentQuestion, SearchAgentReport } from "@/types";
type SortKey = "newest" | "oldest" | "name" | "status";
const CACHE_KEY = "leads:v2";
const CACHE_TTL_MS = 2 * 60 * 1000;
const SEARCH_AGENT_CACHE_KEY = "search-agent:v1";
type SearchAgentDraft = { service: string; idealCustomer: string; locations: string; goal: string; messages: SearchAgentMessage[]; open: boolean; report: SearchAgentReport | null; };
export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>(seed),
    [selected, setSelected] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [niche, setNiche] = useState("Dental practices"),
    [location, setLocation] = useState("London, UK"),
    [mode, setMode] = useState<"single" | "multi">("single"),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState<"All" | LeadStatus>("All"),
    [sort, setSort] = useState<SortKey>("newest"),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(25),
    [confirmDelete, setConfirmDelete] = useState(false),
    [terminal, setTerminal] = useState<ScraperProgress[]>([]),
    [service, setService] = useState(""),
    [idealCustomer, setIdealCustomer] = useState(""),
    [locations, setLocations] = useState(""),
    [goal, setGoal] = useState(""),
    [draft, setDraft] = useState(""),
    [agentQuestions, setAgentQuestions] = useState<SearchAgentQuestion[]>([]),
    [agentMessages, setAgentMessages] = useState<SearchAgentMessage[]>([]),
    [agentInterviewOpen, setAgentInterviewOpen] = useState(true),
    [searchAgent, setSearchAgent] = useState<SearchAgentReport | null>(null),
    [searchAgentLoading, setSearchAgentLoading] = useState(false),
    [typing, setTyping] = useState(false),
    [clientCacheReady, setClientCacheReady] = useState(false),
    [searchAgentNotice, setSearchAgentNotice] = useState("");
  const terminalRef = useRef<HTMLDivElement>(null);
  const endOfChatRef = useRef<HTMLDivElement>(null);
  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/leads/discovery");
      const j = (await r.json()) as { data?: Lead[]; error?: string };
      if (!r.ok) throw new Error(j.error);
      if (j.data) {
        setLeads(j.data);
        writeCachedValue(CACHE_KEY, j.data);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not refresh database");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const cachedLeads = readCachedValue<Lead[]>(CACHE_KEY, CACHE_TTL_MS);
    const cachedAgent = readCachedValue<SearchAgentDraft>(SEARCH_AGENT_CACHE_KEY, 24 * 60 * 60 * 1000);

    if (cachedLeads) {
      setLeads(cachedLeads);
      setLoading(false);
    } else {
      void load();
    }

    if (cachedAgent) {
      setService(cachedAgent.service);
      setIdealCustomer(cachedAgent.idealCustomer);
      setLocations(cachedAgent.locations);
      setGoal(cachedAgent.goal);
      setAgentMessages(cachedAgent.messages);
      setAgentInterviewOpen(cachedAgent.open);
      setSearchAgent(cachedAgent.report);
    }

    setClientCacheReady(true);
  }, []);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return leads
      .filter(
        (l) =>
          (statusFilter === "All" || l.status === statusFilter) &&
          (!term ||
            [
              l.business_name,
              l.website_url,
              l.phone,
              l.address,
              l.niche,
              l.location,
            ].some((v) => v?.toLowerCase().includes(term))),
      )
      .sort((a, b) =>
        sort === "name"
          ? a.business_name.localeCompare(b.business_name)
          : sort === "status"
            ? a.status.localeCompare(b.status)
            : sort === "oldest"
              ? Date.parse(a.created_at) - Date.parse(b.created_at)
              : Date.parse(b.created_at) - Date.parse(a.created_at),
      );
  }, [leads, query, statusFilter, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    safePage = Math.min(page, pages),
    visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    allVisibleSelected =
      visible.length > 0 && visible.every((l) => selected.includes(l.id));
  useEffect(() => setPage(1), [query, statusFilter, sort, pageSize]);
  useEffect(() => {
    const element = terminalRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [terminal]);
  useEffect(() => {
    const element = endOfChatRef.current;
    if (element) element.scrollIntoView({ behavior: "smooth", block: "end" });
    if (!clientCacheReady) return;
    writeCachedValue(SEARCH_AGENT_CACHE_KEY, {
      service,
      idealCustomer,
      locations,
      goal,
      messages: agentMessages,
      open: agentInterviewOpen,
      report: searchAgent,
    });
  }, [agentMessages, agentInterviewOpen, clientCacheReady, goal, idealCustomer, locations, searchAgent, service]);
  async function discover() {
    setLoading(true);
    setTerminal([]);
    setNotice(
      `Running ${mode} search for new ${niche} records not already in your database…`,
    );
    try {
      const r = await fetch("/api/leads/discovery/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ niche, location, mode }),
      });
      if (!r.ok || !r.body) {
        const error = (await r.json()) as { error?: string };
        throw new Error(error.error ?? "Discovery stream unavailable");
      }
      const reader = r.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        result:
          | {
              data: Lead[];
              meta?: {
                mode: string;
                returned: number;
                scraped: number;
                areas: string[];
                skippedExisting: number;
                addressDuplicates: number;
                phoneDuplicates: number;
                exhausted: boolean;
              };
            }
          | undefined;
      for (;;) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        const lines = buffer.split("\n");
        buffer = chunk.done ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (!line.trim()) continue;
          const message = JSON.parse(line) as
            | { type: "event"; event: ScraperProgress }
            | { type: "lead"; lead: Lead }
            | { type: "result"; payload: typeof result }
            | { type: "error"; error: string };
          if (message.type === "event")
            setTerminal((old) => [...old.slice(-299), message.event]);
          else if (message.type === "lead")
            setLeads((old) =>
              old.some((lead) => lead.google_place_id === message.lead.google_place_id)
                ? old
                : [message.lead, ...old],
            );
          else if (message.type === "result") result = message.payload;
          else throw new Error(message.error);
        }
        if (chunk.done) break;
      }
      if (!result?.data) throw new Error("Discovery finished without a result");
      setLeads((old) => {
        const next = [
          ...result.data.filter(
            (n) => !old.some((o) => o.google_place_id === n.google_place_id),
          ),
          ...old,
        ];
        writeCachedValue(CACHE_KEY, next);
        return next;
      });
      if (result.meta?.exhausted)
        setNotice(
          `Scraped ${result.meta.scraped} valid profiles, but all matched stored Place IDs, addresses or phone numbers.`,
        );
      else
        setNotice(
          `${result.meta?.returned ?? result.data.length} new leads saved from ${result.meta?.scraped ?? result.data.length} valid profiles. Excluded ${result.meta?.skippedExisting ?? 0} stored Place IDs, ${result.meta?.addressDuplicates ?? 0} addresses and ${result.meta?.phoneDuplicates ?? 0} phone numbers.`,
        );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setLoading(false);
    }
  }
  async function enrich() {
    if (!selected.length) return;
    setLoading(true);
    setNotice("");
    try {
      const r = await fetch("/api/leads/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadIds: selected.slice(0, 10) }),
      });
      const j = (await r.json()) as { data?: unknown[]; error?: string };
      if (!r.ok) throw new Error(j.error);
      const processed = selected.slice(0, 10);
      setLeads((x) => {
        const next = x.map((l) =>
          processed.includes(l.id) ? { ...l, status: "Enriched" as const } : l,
        );
        writeCachedValue(CACHE_KEY, next);
        return next;
      });
      setNotice(
        `${j.data?.length ?? 0} leads enriched. Enrichment runs in batches of 10.`,
      );
      setSelected((x) => x.filter((id) => !processed.includes(id)));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Enrichment failed");
    } finally {
      setLoading(false);
    }
  }
  async function setBulkStatus(status: LeadStatus) {
    if (!selected.length) return;
    setLoading(true);
    try {
      const r = await fetch("/api/leads/manage", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: selected, status }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error);
      setLeads((x) => {
        const next = x.map((l) => (selected.includes(l.id) ? { ...l, status: status as LeadStatus } : l));
        writeCachedValue(CACHE_KEY, next);
        return next;
      });
      setNotice(`${selected.length} leads updated to ${status}.`);
      setSelected([]);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }
  async function removeSelected() {
    setLoading(true);
    try {
      const r = await fetch("/api/leads/manage", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error);
      const count = selected.length;
      setLeads((x) => {
        const next = x.filter((l) => !selected.includes(l.id));
        writeCachedValue(CACHE_KEY, next);
        return next;
      });
      setSelected([]);
      setConfirmDelete(false);
      setNotice(`${count} leads permanently deleted.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setLoading(false);
    }
  }
  function exportCsv() {
    const rows = selected.length
      ? leads.filter((l) => selected.includes(l.id))
      : filtered;
    const headers = [
      "Business Name",
      "Website",
      "Phone",
      "Address",
      "Niche",
      "Location",
      "Status",
      "Created",
    ];
    const escape = (v: string | null) => `"${(v ?? "").replaceAll('"', '""')}"`;
    const csv = [
      headers.map(escape).join(","),
      ...rows.map((l) =>
        [
          l.business_name,
          l.website_url,
          l.phone,
          l.address,
          l.niche,
          l.location,
          l.status,
          l.created_at,
        ]
          .map(escape)
          .join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`${rows.length} leads exported.`);
  }
  function openCallQueue(): void {
    window.location.assign("/calls");
  }
  async function runSearchAgent() {
    setSearchAgentLoading(true);
    setTyping(true);
    setSearchAgentNotice("");
    try {
      const nextMessages: SearchAgentMessage[] = [
        ...agentMessages,
        { id: crypto.randomUUID(), role: "user", content: `${service} | ${idealCustomer} | ${locations} | ${goal}`, createdAt: new Date().toISOString() },
      ];
      const response = await fetch("/api/leads/search-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          service,
          idealCustomer,
          locations,
          goal,
          history: nextMessages.map((message) => ({ role: message.role, content: message.content })),
        }),
      });
      const json = (await response.json()) as {
        data?: SearchAgentReport;
        error?: string;
      };
      const data = json.data;
      if (!response.ok || !data) throw new Error(json.error ?? "Search Agent failed");
      setSearchAgent(data);
      setService(data.context.service);
      setIdealCustomer(data.context.idealCustomer);
      setLocations(data.context.locations);
      setGoal(data.context.goal);
      setAgentQuestions(data.nextQuestion ? [data.nextQuestion] : []);
      setAgentInterviewOpen(true);
      setAgentMessages(data.messages ?? nextMessages);
      if (data.recommendations.length) {
        setNiche(data.bestNiche);
        setLocation(data.bestLocation);
        setMode("multi");
        setSearchAgentNotice(`Best first search: ${data.bestSearch}`);
      } else {
        setSearchAgentNotice(data.summary);
      }
      if (data.terminal?.length) setTerminal((current) => [...current.slice(-299), ...data.terminal]);
    } catch (error) {
      setSearchAgentNotice(error instanceof Error ? error.message : "Search Agent failed");
    } finally {
      setTyping(false);
      setSearchAgentLoading(false);
    }
  }
  async function sendAgentMessage() {
    const text = draft.trim();
    if (!text || searchAgentLoading) return;
    setDraft("");
    const nextMessages: SearchAgentMessage[] = [
      ...agentMessages,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      },
    ];
    setAgentMessages(nextMessages);
    setSearchAgentLoading(true);
    setTyping(true);
    try {
      const response = await fetch("/api/leads/search-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          service,
          idealCustomer,
          locations,
          goal,
          history: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });
      const json = (await response.json()) as { data?: SearchAgentReport; error?: string };
      const data = json.data;
      if (!response.ok || !data) throw new Error(json.error ?? "Search Agent failed");
      setSearchAgent(data);
      setService(data.context.service);
      setIdealCustomer(data.context.idealCustomer);
      setLocations(data.context.locations);
      setGoal(data.context.goal);
      setAgentQuestions(data.nextQuestion ? [data.nextQuestion] : []);
      setAgentInterviewOpen(true);
      setAgentMessages(data.messages ?? nextMessages);
      if (data.recommendations.length) {
        setNiche(data.bestNiche);
        setLocation(data.bestLocation);
        setMode("multi");
        setSearchAgentNotice(`Best first search: ${data.bestSearch}`);
      } else {
        setSearchAgentNotice(data.summary);
      }
      if (data.terminal?.length) {
        setTerminal((current) => [...current.slice(-299), ...data.terminal]);
      }
    } catch (error) {
      setSearchAgentNotice(error instanceof Error ? error.message : "Search Agent failed");
      setAgentMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I hit a snag there. Try again or give me a little more context.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setTyping(false);
      setSearchAgentLoading(false);
    }
  }
  return (
    <div className="p-5 lg:p-8">
      <PageHeader
        eyebrow="AGENT 01 + 02 / PROSPECT INTELLIGENCE"
        title="Lead database control."
        description="Discover, organize, export, enrich and safely manage every prospect record from one workspace."
      />
      <div className="panel mb-5 rounded-xl border border-secondary/20 bg-gradient-to-br from-[#0b1220] to-[#09101a] p-4 shadow-[0_0_30px_rgba(6,182,212,0.08)]">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={14} className="text-secondary" />
          <span className="font-mono text-[10px] tracking-[.18em] text-secondary">
            SEARCH AGENT INTERVIEW
          </span>
        </div>
        <div className="mt-4 rounded-xl border border-border bg-[#080e18]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="font-mono text-[9px] tracking-[.18em] text-secondary">CHAT AGENT</div>
              <div className="text-sm text-slate-400">A memory-based assistant that asks one question at a time.</div>
            </div>
            <button onClick={() => setAgentInterviewOpen((current) => !current)} className="btn btn-ghost py-2.5">
              {agentInterviewOpen ? "COLLAPSE CHAT" : "OPEN CHAT"}
            </button>
          </div>
          {agentInterviewOpen && (
            <div className="grid gap-4 p-4 xl:grid-cols-[1.15fr_.85fr]">
              <div className="rounded-xl border border-border bg-[#050a0e] p-4">
                <div className="thin-scroll max-h-[360px] space-y-3 overflow-auto pr-2">
                  {agentMessages.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-[#0b111e] p-3 text-xs text-slate-500">
                      nexus@search-agent: Ask me anything about the market you want to target.
                    </div>
                  ) : (
                    agentMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-6 ${message.role === "assistant" ? "border-secondary/20 bg-secondary/10 text-slate-100" : "border-primary/20 bg-primary/10 text-slate-100"}`}
                        >
                          <div className="mb-1 font-mono text-[9px] tracking-[.18em] text-slate-500">
                            {message.role === "assistant" ? "NEXUS" : "YOU"}
                          </div>
                          {message.content}
                        </div>
                      </div>
                    ))
                  )}
                  {searchAgentLoading && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl border border-secondary/20 bg-secondary/10 px-4 py-3 text-xs text-secondary">
                        Nexus is thinking...
                      </div>
                    </div>
                  )}
                  <div ref={endOfChatRef} />
                </div>
                <div className="mt-4 space-y-3">
                  <div className="flex gap-2">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendAgentMessage();
                        }
                      }}
                      className="input min-h-[86px] flex-1 resize-none py-3 text-sm"
                      placeholder="Type your message to Nexus..."
                      disabled={searchAgentLoading}
                    />
                    <button
                      onClick={() => void sendAgentMessage()}
                      disabled={searchAgentLoading || !draft.trim()}
                      className="btn btn-primary min-w-24 self-end py-3"
                    >
                      <Sparkles size={14} />
                      SEND
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setService("");
                        setIdealCustomer("");
                        setLocations("");
                        setGoal("");
                        setDraft("");
                        setAgentMessages([
                          {
                            id: crypto.randomUUID(),
                            role: "assistant",
                            content: "Hi - I'll help you choose the best niche and location. What service are you selling?",
                            createdAt: new Date().toISOString(),
                          },
                        ]);
                        setSearchAgent(null);
                        setSearchAgentNotice("");
                        setAgentQuestions([]);
                      }}
                      className="btn btn-ghost py-2.5"
                    >
                      NEW CHAT
                    </button>
                    <button
                      onClick={() => void runSearchAgent()}
                      disabled={searchAgentLoading || !service.trim()}
                      className="btn btn-ghost py-2.5"
                    >
                      <Sparkles size={14} />
                      RUN ANALYSIS
                    </button>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-4">
                <div className="font-mono text-[9px] tracking-[.18em] text-slate-500">MEMORY</div>
                <div className="mt-3 space-y-3 text-xs text-slate-400">
                  <div><span className="text-slate-500">Service:</span> {service || "—"}</div>
                  <div><span className="text-slate-500">Ideal customer:</span> {idealCustomer || "—"}</div>
                  <div><span className="text-slate-500">Locations:</span> {locations || "—"}</div>
                  <div><span className="text-slate-500">Goal:</span> {goal || "—"}</div>
                </div>
                {agentQuestions.length > 0 && (
                  <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="font-mono text-[9px] tracking-[.18em] text-primary">NEXT QUESTION</div>
                    <div className="mt-2 text-xs text-slate-300">{agentQuestions[0]?.question}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Search Agent helps choose the strongest niche and location to target before you launch a discovery run.
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Search Agent helps choose the strongest niche and location to target before you launch a discovery run.
        </div>
        {searchAgentNotice && (
          <div className="mt-3 rounded-lg border border-secondary/20 bg-secondary/5 p-3 text-xs text-secondary">
            {searchAgentNotice}
          </div>
        )}
        {searchAgent && (
          <div className="mt-4 grid gap-3 xl:grid-cols-[1.15fr_.85fr]">
            <div className="rounded-xl border border-border bg-[#0a101b] p-4">
              <div className="font-mono text-[9px] tracking-[.18em] text-primary">
                RECOMMENDED STARTING POINT
              </div>
              <div className="mt-3 text-lg font-medium text-white">
                {searchAgent.bestNiche} · {searchAgent.bestLocation}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {searchAgent.summary}
              </p>
              <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-slate-300">
                <span className="font-mono text-[9px] text-primary">FIRST SEARCH</span>
                <div className="mt-1">{searchAgent.bestSearch}</div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-[#0a101b] p-4">
              <div className="font-mono text-[9px] tracking-[.18em] text-slate-500">
                RANKED TARGETS
              </div>
              <div className="mt-3 space-y-3">
                {searchAgent.recommendations.map((item) => (
                  <div key={`${item.niche}-${item.location}`} className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">{item.niche}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.location}</div>
                      </div>
                      <div className="font-mono text-sm text-primary">{item.score}</div>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{item.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-secondary/20 bg-secondary/5 p-3 text-xs text-secondary">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <div className="panel rounded-xl p-4">
        <div className="grid gap-3 xl:grid-cols-[1fr_1fr_310px_auto]">
          <label className="relative">
            <Search
              className="absolute left-3 top-3.5 text-slate-600"
              size={16}
            />
            <input
              className="input pl-10"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              aria-label="Target niche"
            />
          </label>
          <label className="relative">
            <MapPin
              className="absolute left-3 top-3.5 text-slate-600"
              size={16}
            />
            <input
              className="input pl-10"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              aria-label="Location"
            />
          </label>
          <div
            className="grid grid-cols-2 rounded-lg border border-border bg-[#080e18] p-1"
            aria-label="Search mode"
          >
            <button
              onClick={() => setMode("single")}
              className={`rounded-md px-3 py-2 font-mono text-[9px] transition ${mode === "single" ? "bg-primary/15 text-primary" : "text-slate-600 hover:text-slate-300"}`}
            >
              SINGLE SEARCH
            </button>
            <button
              onClick={() => setMode("multi")}
              className={`rounded-md px-3 py-2 font-mono text-[9px] transition ${mode === "multi" ? "bg-secondary/15 text-secondary" : "text-slate-600 hover:text-slate-300"}`}
            >
              MULTI SEARCH
            </button>
          </div>
          <button
            onClick={discover}
            className="btn btn-primary"
            disabled={loading}
          >
            <Zap size={14} />
            {loading ? "CAMPAIGN RUNNING…" : "START CAMPAIGN"}
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-1 font-mono text-[9px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {mode === "single"
              ? "ONE LOCATION · EXACT + NORTH / SOUTH / EAST / WEST · ALL AVAILABLE RESULTS"
              : "PROMINENT AREAS DISCOVERED AUTOMATICALLY · MULTIPLE AREA SEARCHES QUEUED · ALL AVAILABLE RESULTS"}
          </span>
          <span>
            NO LEAD-COUNT LIMIT · DATABASE NOVELTY REPORTED SEPARATELY
          </span>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-primary/20 bg-[#050a0e] shadow-[0_0_40px_rgba(16,185,129,0.06)]">
        <div className="flex items-center justify-between border-b border-primary/15 bg-primary/[.04] px-4 py-3">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-primary" />
            <span className="font-mono text-[10px] tracking-[.18em] text-primary">
              LEAD INTELLIGENCE LIVE OPS
            </span>
            {loading && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary shadow-[0_0_10px_#10b981]" />
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[9px] text-slate-600">
              {terminal.length} EVENTS
            </span>
            <button
              onClick={() => setTerminal([])}
              className="font-mono text-[9px] text-slate-500 hover:text-white"
            >
              CLEAR
            </button>
          </div>
        </div>
        <div
          ref={terminalRef}
          className="thin-scroll h-56 overflow-y-auto p-4 font-mono text-[10px] leading-5"
          aria-live="polite"
        >
          {terminal.length === 0 ? (
            <div className="text-slate-700">
              <span className="text-primary">nexus@lead-intel:~$</span> Ready.
              Start a discovery campaign to stream live operations.
            </div>
          ) : (
            terminal.map((event, index) => (
              <div
                key={`${event.timestamp}-${index}`}
                className="grid grid-cols-[70px_58px_1fr] gap-2 border-l border-transparent hover:border-primary/30 hover:bg-white/[.015]"
              >
                <span className="text-slate-700">
                  {new Date(event.timestamp).toLocaleTimeString([], {
                    hour12: false,
                  })}
                </span>
                <span
                  className={
                    event.level === "error"
                      ? "text-danger"
                      : event.level === "warning"
                        ? "text-amber-400"
                        : event.level === "success"
                          ? "text-primary"
                          : "text-secondary"
                  }
                >
                  [{event.phase.toUpperCase()}]
                </span>
                <span className="text-slate-400">
                  <span className="mr-2 text-slate-700">›</span>
                  {event.message}
                  {event.current !== undefined && event.total !== undefined && (
                    <span className="ml-2 text-slate-700">
                      ({event.current}/{event.total})
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="mt-5 panel overflow-hidden rounded-xl">
        <div className="border-b border-border p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <label className="relative min-w-0 flex-1">
              <Search
                className="absolute left-3 top-3 text-slate-600"
                size={15}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input py-2.5 pl-9 text-xs"
                placeholder="Search names, websites, phone numbers, niches or locations…"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "All" | LeadStatus)
                }
                className="input w-auto py-2.5 text-xs"
              >
                <option>All</option>
                <option>Discovered</option>
                <option>Enriched</option>
                <option>Contacted</option>
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="input w-auto py-2.5 text-xs"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Business A–Z</option>
                <option value="status">Status</option>
              </select>
              <button
                onClick={load}
                className="btn btn-ghost py-2.5"
                title="Refresh"
              >
                <RefreshCw
                  className={loading ? "animate-spin" : ""}
                  size={14}
                />
              </button>
              <button
                onClick={openCallQueue}
                disabled={loading}
                className="btn border border-secondary/25 bg-secondary/10 py-2.5 text-secondary"
              >
                <PhoneCall size={14} />
                SUPABASE CALL QUEUE
              </button>
              <button onClick={exportCsv} className="btn btn-ghost py-2.5">
                <Download size={14} />
                EXPORT {selected.length ? selected.length : "ALL"}
              </button>
            </div>
          </div>
          {selected.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <span className="mr-2 font-mono text-[10px] text-primary">
                {selected.length} SELECTED
              </span>
              <button
                onClick={enrich}
                disabled={loading}
                className="btn btn-ghost py-2"
              >
                <Sparkles size={13} />
                ENRICH NEXT 10
              </button>
              <span className="font-mono text-[9px] text-slate-600">
                SET STATUS:
              </span>
              {(["Discovered", "Enriched", "Contacted"] as LeadStatus[]).map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setBulkStatus(s)}
                    className="rounded border border-border px-3 py-2 font-mono text-[9px] text-slate-400 hover:border-secondary hover:text-secondary"
                  >
                    {s.toUpperCase()}
                  </button>
                ),
              )}
              <button
                onClick={() => setConfirmDelete(true)}
                className="btn ml-auto border border-danger/30 bg-danger/10 py-2 text-danger"
              >
                <Trash2 size={13} />
                DELETE
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-b border-border bg-[#0a101b] px-4 py-3">
          <div className="flex items-center gap-2 font-mono text-[9px] text-slate-600">
            <SlidersHorizontal size={12} />
            {filtered.length} MATCHING · {leads.length} TOTAL
          </div>
          <label className="flex items-center gap-2 text-[10px] text-slate-500">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() =>
                setSelected((x) =>
                  allVisibleSelected
                    ? x.filter((id) => !visible.some((l) => l.id === id))
                    : [...new Set([...x, ...visible.map((l) => l.id)])],
                )
              }
              className="accent-emerald-500"
            />{" "}
            SELECT PAGE
          </label>
        </div>
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="border-b border-border bg-[#0a101b] font-mono text-[9px] tracking-wider text-slate-600">
              <tr>
                <th className="p-4"></th>
                <th>BUSINESS</th>
                <th>NICHE</th>
                <th>WEBSITE</th>
                <th>PHONE</th>
                <th>LOCATION</th>
                <th>STATUS</th>
                <th>CREATED</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-border/70 text-xs hover:bg-white/[.02]"
                  >
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selected.includes(l.id)}
                        onChange={() =>
                          setSelected((x) =>
                            x.includes(l.id)
                              ? x.filter((v) => v !== l.id)
                              : [...x, l.id],
                          )
                        }
                        className="accent-emerald-500"
                      />
                    </td>
                    <td className="py-4">
                      <div className="font-medium text-white">
                        {l.business_name}
                      </div>
                      <div className="mt-1 max-w-[180px] truncate font-mono text-[9px] text-slate-600">
                        {l.google_place_id}
                      </div>
                    </td>
                    <td className="text-slate-400">{l.niche}</td>
                    <td className="text-secondary">
                      {l.website_url ? (
                        <a
                          href={l.website_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 hover:underline"
                        >
                          <Globe2 size={12} />
                          {l.website_url.replace(/^https?:\/\//, "")}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-slate-500">{l.phone ?? "—"}</td>
                    <td className="max-w-[220px] text-slate-500">
                      {l.address ?? l.location}
                    </td>
                    <td>
                      <span
                        className={`rounded border px-2 py-1 font-mono text-[9px] ${l.status === "Enriched" ? "border-primary/30 bg-primary/10 text-primary" : l.status === "Contacted" ? "border-blue-400/30 bg-blue-400/10 text-blue-400" : "border-slate-700 text-slate-500"}`}
                      >
                        {l.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="font-mono text-[9px] text-slate-600">
                      {new Date(l.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="p-14 text-center font-mono text-xs text-slate-600"
                  >
                    NO RECORDS MATCH THE CURRENT FILTERS
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            Rows per page{" "}
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="input w-auto py-1.5 text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[9px] text-slate-600">
              PAGE {safePage} OF {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="btn btn-ghost p-2 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={safePage === pages}
              className="btn btn-ghost p-2 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
      {confirmDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="panel w-full max-w-md rounded-xl p-6">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-danger/10 text-danger">
              <Trash2 size={20} />
            </div>
            <h2 className="mt-4 text-xl font-medium text-white">
              Delete {selected.length} leads?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This permanently removes the selected leads and their enrichment
              and inbox history. This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn btn-ghost"
              >
                CANCEL
              </button>
              <button
                onClick={removeSelected}
                disabled={loading}
                className="btn bg-danger text-white hover:bg-red-600"
              >
                {loading ? "DELETING…" : "DELETE PERMANENTLY"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

