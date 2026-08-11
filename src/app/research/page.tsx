"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, ExternalLink, FlaskConical, Globe2, Linkedin, Mail, Phone, RefreshCw, Search, Sparkles, UserRound, UsersRound, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { readCachedValue, writeCachedValue } from "@/lib/client-cache";
import type { Lead, LeadEnrichment } from "@/types";

type QueueFilter = "All" | "Needs research" | "Researched";
const CACHE_KEY = "research:v2";
const CACHE_TTL_MS = 2 * 60 * 1000;

export default function ResearchPage() {
  const cached = readCachedValue<{ leads: Lead[]; records: LeadEnrichment[] }>(CACHE_KEY, CACHE_TTL_MS);
  const [leads, setLeads] = useState<Lead[]>(cached?.leads ?? []);
  const [records, setRecords] = useState<LeadEnrichment[]>(cached?.records ?? []);
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<string>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("Needs research");
  const [loading, setLoading] = useState(!cached);
  const [notice, setNotice] = useState("");
  const recordMap = useMemo(() => new Map(records.map(record => [record.lead_id, record])), [records]);

  async function load() {
    setLoading(true);
    try {
      const [leadRes, researchRes] = await Promise.all([fetch("/api/leads/discovery"), fetch("/api/leads/enrich")]);
      const leadJson = await leadRes.json() as { data?: Lead[]; error?: string };
      const researchJson = await researchRes.json() as { data?: LeadEnrichment[]; error?: string };
      if (!leadRes.ok || !researchRes.ok) throw new Error(leadJson.error ?? researchJson.error);
      const next = { leads: leadJson.data ?? [], records: researchJson.data ?? [] };
      setLeads(next.leads);
      setRecords(next.records);
      writeCachedValue(CACHE_KEY, next);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Research queue could not be loaded"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => leads.filter(lead => {
    const researched = recordMap.has(lead.id);
    const matchesFilter = filter === "All" || (filter === "Researched" ? researched : !researched);
    return matchesFilter && (!query || [lead.business_name, lead.website_url, lead.niche, lead.location].some(value => value?.toLowerCase().includes(query.toLowerCase())));
  }), [leads, recordMap, filter, query]);
  const activeLead = leads.find(lead => lead.id === active);
  const activeRecord = active ? recordMap.get(active) : undefined;

  async function research() {
    const batch = selected.slice(0, 10);
    if (!batch.length) return;
    setLoading(true);
    setNotice(`Nexus is reading ${batch.length} website${batch.length === 1 ? "" : "s"}, researching the businesses and checking public sources for decision-makers…`);
    try {
      const response = await fetch("/api/leads/enrich", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leadIds: batch }) });
      const result = await response.json() as { data?: LeadEnrichment[]; error?: string; failures?: Array<{ businessName: string; error: string }>; cached?: number };
      if (!response.ok || !result.data) throw new Error(result.error);
      const completed = result.data.map(record => record.lead_id);
      setRecords(old => {
        const next = [...result.data!, ...old.filter(record => !completed.includes(record.lead_id))];
        writeCachedValue(CACHE_KEY, { leads, records: next });
        return next;
      });
      setLeads(old => {
        const next = old.map(lead => completed.includes(lead.id) ? { ...lead, status: "Enriched" as const } : lead);
        writeCachedValue(CACHE_KEY, { leads: next, records });
        return next;
      });
      setSelected(old => old.filter(id => !completed.includes(id)));
      setActive(result.data[0]?.lead_id);
      const newCount = result.data.length - (result.cached ?? 0);
      setNotice(`${newCount} lean research profile${newCount === 1 ? "" : "s"} completed.${result.cached ? ` ${result.cached} recent profile${result.cached === 1 ? " was" : "s were"} reused at no AI cost.` : ""}${result.failures?.length ? ` ${result.failures.length} could not be completed and remain queued.` : ""}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Research failed"); }
    finally { setLoading(false); }
  }

  return <div className="p-5 lg:p-8">
    <PageHeader eyebrow="AGENT 02 / LEAN LEAD RESEARCH" title="Get the sales facts and first-impression audit you need." description="A cost-efficient pass checks compressed desktop and mobile first-view screenshots, identifies three verified lead leaks, and finds public decision-makers. Use AI Website Critic for the full-page deep audit." action={<button onClick={research} disabled={!selected.length || loading} className="btn btn-primary"><Sparkles size={14}/>{loading ? "RESEARCHING…" : `RESEARCH ${Math.min(10, selected.length) || "SELECTED"}`}</button>}/>
    {notice && <div className="mb-4 flex items-center justify-between rounded-lg border border-secondary/20 bg-secondary/5 p-3 text-xs text-secondary"><span>{notice}</span><button onClick={() => setNotice("")}><X size={13}/></button></div>}
    <section className="grid min-h-[680px] overflow-hidden rounded-xl border border-border bg-surface/60 xl:grid-cols-[440px_1fr]">
      <aside className="border-b border-border xl:border-b-0 xl:border-r">
        <div className="border-b border-border p-4"><div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-600"/><input value={query} onChange={event => setQuery(event.target.value)} className="input py-2.5 pl-9 text-xs" placeholder="Search research queue…"/></div><div className="mt-3 flex gap-2">{(["Needs research", "Researched", "All"] as QueueFilter[]).map(item => <button key={item} onClick={() => setFilter(item)} className={`rounded border px-3 py-2 font-mono text-[9px] ${filter === item ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-slate-600"}`}>{item.toUpperCase()}</button>)}<button onClick={load} className="ml-auto text-slate-500 hover:text-secondary"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/></button></div></div>
        <div className="flex items-center justify-between border-b border-border bg-[#0a101b] px-4 py-3"><span className="font-mono text-[9px] text-slate-600">{visible.length} LEADS · {selected.length} SELECTED</span><label className="flex items-center gap-2 font-mono text-[9px] text-slate-500"><input type="checkbox" checked={visible.length > 0 && visible.slice(0, 10).every(lead => selected.includes(lead.id))} onChange={event => setSelected(event.target.checked ? visible.slice(0, 10).map(lead => lead.id) : [])} className="accent-emerald-500"/>SELECT NEXT 10</label></div>
        <div className="thin-scroll max-h-[560px] overflow-auto">{visible.map(lead => { const researched = recordMap.has(lead.id); return <div key={lead.id} className={`flex cursor-pointer gap-3 border-b border-border p-4 transition ${active === lead.id ? "bg-primary/[.06] shadow-[inset_2px_0_#10b981]" : "hover:bg-white/[.02]"}`} onClick={() => setActive(lead.id)}><input type="checkbox" checked={selected.includes(lead.id)} onClick={event => event.stopPropagation()} onChange={() => setSelected(current => current.includes(lead.id) ? current.filter(id => id !== lead.id) : current.length < 10 ? [...current, lead.id] : current)} className="mt-1 accent-emerald-500"/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><span className="truncate text-xs font-medium text-white">{lead.business_name}</span>{researched ? <CheckCircle2 size={14} className="shrink-0 text-primary"/> : <span className="shrink-0 rounded bg-amber-400/10 px-2 py-1 font-mono text-[8px] text-amber-400">QUEUED</span>}</div><div className="mt-2 flex gap-3 font-mono text-[9px] text-slate-600"><span>{lead.niche}</span><span>·</span><span className="truncate">{lead.location}</span></div></div></div>; })}</div>
      </aside>
      <main className="thin-scroll max-h-[680px] overflow-auto p-5 lg:p-7">{activeLead ? <ResearchDetail lead={activeLead} record={activeRecord}/> : <div className="grid h-full place-items-center text-center"><div><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-secondary/20 bg-secondary/5 text-secondary"><FlaskConical size={26}/></div><h2 className="mt-5 text-lg text-white">Select a lead to inspect</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Choose a completed profile, or select up to 10 businesses and launch live research.</p></div></div>}</main>
    </section>
  </div>;
}

function ResearchDetail({ lead, record }: { lead: Lead; record?: LeadEnrichment }) {
  if (!record) return <div><div className="flex items-start justify-between"><div><div className="font-mono text-[9px] text-amber-400">AWAITING LIVE RESEARCH</div><h2 className="mt-2 text-2xl font-medium text-white">{lead.business_name}</h2><p className="mt-2 text-sm text-slate-500">{lead.address}</p></div>{lead.website_url && <a href={lead.website_url} target="_blank" rel="noreferrer" className="btn btn-ghost"><Globe2 size={13}/>OPEN SITE</a>}</div><div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center"><Sparkles className="mx-auto text-slate-700" size={28}/><p className="mt-4 text-sm text-slate-500">Nexus will read the live website and public sources. It will not save a generic report if genuine research cannot be completed.</p></div></div>;
  return <div>
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="font-mono text-[9px] text-primary">RESEARCH COMPLETE · {new Date(record.updated_at).toLocaleDateString()}</div><h2 className="mt-2 text-2xl font-medium text-white">{lead.business_name}</h2><p className="mt-2 text-sm text-slate-500">{lead.address}</p></div>{lead.website_url && <a href={lead.website_url} target="_blank" rel="noreferrer" className="btn btn-ghost"><ExternalLink size={13}/>VIEW WEBSITE</a>}</div>
    <div className="mt-7 panel rounded-xl p-5"><div className="font-mono text-[9px] text-secondary">WHAT NEXUS UNDERSTANDS ABOUT THIS BUSINESS</div><div className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-300">{record.website_audit_notes}</div></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><InsightList icon={AlertTriangle} title="Where the website is leaking leads" items={record.visual_design_flaws}/><InsightList icon={BriefcaseBusiness} title="Business intelligence & evidence" items={record.pagespeed_issues}/></div>
    <div className="mt-4 panel rounded-xl p-5"><div className="flex items-center gap-2 font-mono text-[9px] text-primary"><UsersRound size={13}/>PUBLICLY VERIFIED DECISION-MAKERS</div>{record.decision_makers.length ? <div className="mt-4 space-y-3">{record.decision_makers.map((person, index) => <div key={`${person.name}-${index}`} className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-[#0a101b] p-4 sm:flex-row sm:items-center"><div className="flex gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-secondary/10 text-secondary"><UserRound size={15}/></div><div><div className="text-sm font-medium text-white">{person.name}</div><div className="mt-1 text-xs text-slate-500">{person.title} · {person.source}</div></div></div><div className="flex flex-wrap gap-3">{person.email && <a href={`mailto:${person.email}`} className="flex items-center gap-2 text-xs text-secondary"><Mail size={13}/>{person.email}</a>}{person.phone && <span className="flex items-center gap-2 text-xs text-slate-400"><Phone size={13}/>{person.phone}</span>}{person.linkedin && <a href={person.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-secondary"><Linkedin size={13}/>PROFILE</a>}</div></div>)}</div> : <p className="mt-4 text-sm text-slate-600">No publicly verified decision-maker was found. Nexus does not invent names or contact details.</p>}</div>
    <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-5"><div className="font-mono text-[9px] text-primary">HOW TO APPROACH THE OWNER</div><p className="mt-3 text-sm leading-6 text-slate-200">{record.value_proposition_angle}</p></div>
  </div>;
}

function InsightList({ icon: Icon, title, items }: { icon: typeof AlertTriangle; title: string; items: string[] }) {
  return <div className="panel rounded-xl p-5"><div className="flex items-center gap-2 font-mono text-[9px] text-slate-500"><Icon size={13}/>{title.toUpperCase()}</div><div className="mt-4 space-y-3">{items.length ? items.map(item => <div key={item} className="flex gap-3 text-xs leading-5 text-slate-400"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-secondary"/>{item}</div>) : <p className="text-xs text-slate-600">No evidence recorded.</p>}</div></div>;
}
