"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clipboard, Download, ExternalLink, FileSearch, LoaderCircle, Monitor, Save, ScanSearch, Smartphone, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { readCachedValue, writeCachedValue } from "@/lib/client-cache";
import type { WebsiteAuditReport } from "@/types";

interface AuditResponse { report: WebsiteAuditReport; screenshots: { desktop: string; mobile: string }; saveWarning?: string }
const CACHE_TTL_MS = 5 * 60 * 1000;

export default function CriticPage() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<AuditResponse>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"desktop" | "mobile">("desktop");

  async function audit() {
    setBusy(true); setError(""); setResult(undefined);
    try {
      const cacheKey = `critic:${url.trim().toLowerCase()}`;
      const cached = readCachedValue<AuditResponse>(cacheKey, CACHE_TTL_MS);
      if (cached) {
        setResult(cached);
        setBusy(false);
        return;
      }
      const response = await fetch("/api/critic/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const json = await response.json() as { data?: AuditResponse; error?: string };
      if (!response.ok || !json.data) throw new Error(json.error ?? "Audit failed");
      setResult(json.data);
      writeCachedValue(cacheKey, json.data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Audit failed"); }
    finally { setBusy(false); }
  }

  function downloadReport() {
    if (!result) return;
    const blob = new Blob([result.report.professionalReport], { type: "text/plain" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${result.report.companyName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-website-audit.txt`; link.click(); URL.revokeObjectURL(link.href);
  }

  return <div className="p-5 lg:p-8">
    <PageHeader eyebrow="AGENT 06 / AI WEBSITE CRITIC" title="Turn any homepage into a client-ready opportunity report." description="Capture the real desktop and mobile experience, score what visitors encounter, and generate an evidence-backed audit you can send directly to the business."/>
    <section className="relative overflow-hidden rounded-2xl border border-secondary/20 bg-gradient-to-br from-secondary/[.08] via-surface/80 to-primary/[.05] p-5 lg:p-7">
      <div className="absolute right-8 top-6 opacity-10"><ScanSearch size={110}/></div>
      <div className="relative max-w-3xl"><label className="font-mono text-[9px] tracking-[.18em] text-secondary">WEBSITE TO INSPECT</label><div className="mt-3 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><ExternalLink size={15} className="absolute left-4 top-4 text-slate-600"/><input value={url} onChange={event => setUrl(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && url && !busy) void audit(); }} className="input py-3.5 pl-11 text-sm" placeholder="https://company.com"/></div><button onClick={audit} disabled={!url || busy} className="btn btn-primary min-w-48 py-3.5">{busy ? <LoaderCircle size={15} className="animate-spin"/> : <Sparkles size={15}/>} {busy ? "AUDITING WEBSITE…" : "GENERATE AUDIT"}</button></div><p className="mt-3 text-xs leading-5 text-slate-500">Nexus launches a real browser at desktop and mobile sizes. Reports are generated only from captured or source-backed evidence.</p></div>
    </section>
    {error && <div className="mt-5 flex gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-red-300"><AlertTriangle size={18} className="shrink-0"/><div><div className="font-medium">Audit could not be completed</div><p className="mt-1 text-xs leading-5 text-red-300/70">{error}</p></div></div>}
    {busy && <AuditProgress/>}
    {result && <AuditResult result={result} view={view} setView={setView} downloadReport={downloadReport}/>} 
  </div>;
}

function AuditProgress() {
  return <div className="mt-5 grid gap-4 md:grid-cols-4">{[[Monitor,"Capturing desktop"],[Smartphone,"Capturing mobile"],[FileSearch,"Checking evidence"],[Sparkles,"Writing client report"]].map(([Icon,label], index) => { const Item = Icon as typeof Monitor; return <div key={String(label)} className="panel rounded-xl p-5"><Item size={18} className="animate-pulse text-secondary"/><div className="mt-4 font-mono text-[9px] text-slate-500">STEP 0{index + 1}</div><div className="mt-2 text-xs text-slate-300">{String(label)}</div></div>; })}</div>;
}

function AuditResult({ result, view, setView, downloadReport }: { result: AuditResponse; view: "desktop"|"mobile"; setView: (value:"desktop"|"mobile")=>void; downloadReport:()=>void }) {
  const { report } = result;
  const scoreTone = report.overallScore >= 80 ? "text-primary border-primary/30 bg-primary/5" : report.overallScore >= 60 ? "text-amber-300 border-amber-400/30 bg-amber-400/5" : "text-danger border-danger/30 bg-danger/5";
  return <div className="mt-5 space-y-5">
    <section className="grid gap-5 xl:grid-cols-[320px_1fr]"><div className={`rounded-2xl border p-7 ${scoreTone}`}><div className="font-mono text-[9px] tracking-widest">OVERALL WEBSITE SCORE</div><div className="mt-4 text-7xl font-semibold">{report.overallScore}</div><div className="mt-1 text-sm opacity-70">out of 100</div><div className="mt-6 border-t border-current/20 pt-5"><div className="text-lg font-medium text-white">{report.companyName}</div><a href={report.url} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs opacity-70">{report.url}</a></div></div><div className="panel rounded-2xl p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-mono text-[9px] text-secondary">EXECUTIVE ASSESSMENT</div><h2 className="mt-2 text-xl text-white">What the website communicates today</h2></div><div className="flex gap-2"><button onClick={() => navigator.clipboard.writeText(report.professionalReport)} className="btn btn-ghost py-2"><Clipboard size={12}/>COPY REPORT</button><button onClick={downloadReport} className="btn btn-ghost py-2"><Download size={12}/>DOWNLOAD</button></div></div><p className="mt-5 whitespace-pre-line text-sm leading-7 text-slate-300">{report.executiveSummary}</p><div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-xs">{report.savedToGoogleSheets ? <><CheckCircle2 size={14} className="text-primary"/><span className="text-primary">Saved to Google Sheets</span></> : <><Save size={14} className="text-amber-400"/><span className="text-amber-300">{result.saveWarning ?? "Google Sheets destination not configured"}</span></>}</div></div></section>
    <section className="panel overflow-hidden rounded-2xl"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><div className="font-mono text-[9px] text-slate-500">CAPTURED EVIDENCE</div><div className="mt-1 text-sm text-white">Homepage screenshot</div></div><div className="flex rounded-lg border border-border bg-background p-1"><button onClick={() => setView("desktop")} className={`flex items-center gap-2 rounded px-3 py-2 font-mono text-[9px] ${view === "desktop" ? "bg-secondary/10 text-secondary" : "text-slate-600"}`}><Monitor size={12}/>DESKTOP</button><button onClick={() => setView("mobile")} className={`flex items-center gap-2 rounded px-3 py-2 font-mono text-[9px] ${view === "mobile" ? "bg-secondary/10 text-secondary" : "text-slate-600"}`}><Smartphone size={12}/>MOBILE</button></div></div><div className="max-h-[620px] overflow-auto bg-[#05080d] p-4 text-center"><img src={view === "desktop" ? result.screenshots.desktop : result.screenshots.mobile} alt={`${view} homepage capture`} className={`mx-auto rounded-lg border border-slate-800 ${view === "mobile" ? "max-w-[390px]" : "w-full"}`}/></div></section>
    <section><div className="mb-3 font-mono text-[9px] tracking-widest text-slate-500">CATEGORY SCORES</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{report.scores.map(item => <div key={item.category} className="panel rounded-xl p-5"><div className="flex items-center justify-between"><span className="text-xs text-slate-300">{item.category}</span><span className={`font-mono text-lg ${item.score >= 8 ? "text-primary" : item.score >= 6 ? "text-amber-300" : "text-danger"}`}>{item.score}<small className="text-[9px] text-slate-600">/10</small></span></div><div className="mt-3 h-1 rounded bg-slate-800"><div className="h-full rounded bg-gradient-to-r from-secondary to-primary" style={{width:`${item.score*10}%`}}/></div><p className="mt-4 text-xs leading-5 text-slate-400">{item.finding}</p><p className="mt-3 border-t border-border pt-3 font-mono text-[9px] leading-4 text-slate-600">EVIDENCE: {item.evidence}</p></div>)}</div></section>
    <section className="panel rounded-2xl p-5 lg:p-7"><div className="flex items-end justify-between"><div><div className="font-mono text-[9px] text-danger">PRIORITISED ACTION PLAN</div><h2 className="mt-2 text-xl text-white">{report.improvements.length} actionable improvements</h2></div></div><div className="mt-5 space-y-3">{report.improvements.map((item,index) => <div key={`${item.title}-${index}`} className="grid gap-4 rounded-xl border border-border bg-[#090e17] p-5 lg:grid-cols-[46px_1fr_1fr]"><div className="font-mono text-2xl text-slate-700">{String(index+1).padStart(2,"0")}</div><div><div className="flex items-center gap-2"><span className={`rounded px-2 py-1 font-mono text-[8px] ${item.priority === "High" ? "bg-danger/10 text-danger" : item.priority === "Medium" ? "bg-amber-400/10 text-amber-300" : "bg-secondary/10 text-secondary"}`}>{item.priority.toUpperCase()}</span><span className="text-sm font-medium text-white">{item.title}</span></div><p className="mt-3 text-xs leading-5 text-slate-400">{item.problem}</p><p className="mt-3 font-mono text-[9px] leading-4 text-slate-600">OBSERVED: {item.evidence}</p></div><div className="rounded-lg border border-primary/10 bg-primary/[.03] p-4"><div className="font-mono text-[8px] text-primary">RECOMMENDATION</div><p className="mt-2 text-xs leading-5 text-slate-300">{item.recommendation}</p><div className="mt-3 font-mono text-[8px] text-slate-600">BUSINESS IMPACT</div><p className="mt-1 text-xs leading-5 text-slate-500">{item.businessImpact}</p></div></div>)}</div></section>
    <section className="panel rounded-2xl p-6"><div className="font-mono text-[9px] text-primary">CLIENT-READY REPORT</div><div className="mt-5 whitespace-pre-line text-sm leading-7 text-slate-300">{report.professionalReport}</div></section>
  </div>;
}
