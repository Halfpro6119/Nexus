"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe2, Phone, RefreshCw, Save, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { readCachedValue, writeCachedValue } from "@/lib/client-cache";
import type { CallQueueEntry, CallQueueStatus } from "@/types";

const statuses: CallQueueStatus[] = ["Not Called", "Attempted", "Connected", "Follow Up", "Do Not Call"];
const CACHE_KEY = "calls:v1";
const CACHE_TTL_MS = 2 * 60 * 1000;

export default function CallsPage() {
  const [entries, setEntries] = useState<CallQueueEntry[]>(() => readCachedValue<CallQueueEntry[]>(CACHE_KEY, CACHE_TTL_MS) ?? []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | CallQueueStatus>("All");
  const [loading, setLoading] = useState(entries.length === 0);
  const [notice, setNotice] = useState("");

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const response = await fetch("/api/leads/calls", { cache: "no-store" });
      const result = (await response.json()) as { data?: CallQueueEntry[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Call queue unavailable");
      const next = result.data ?? [];
      setEntries(next);
      writeCachedValue(CACHE_KEY, next);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Call queue unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return entries.filter(
      (entry) =>
        (filter === "All" || entry.status === filter) &&
        (!term ||
          [
            entry.lead.business_name,
            entry.lead.phone,
            entry.website_url,
            entry.lead.website_url,
            entry.lead.address,
            entry.lead.location,
            entry.notes,
          ].some((value) => value?.toLowerCase().includes(term))),
    );
  }, [entries, filter, query]);

  async function save(entry: CallQueueEntry): Promise<void> {
    const response = await fetch("/api/leads/calls", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: entry.id, status: entry.status, notes: entry.notes }),
    });
    const result = (await response.json()) as { data?: CallQueueEntry; error?: string };
    if (!response.ok || !result.data) {
      setNotice(result.error ?? "Call update failed");
      return;
    }
    setEntries((current) => {
      const next = current.map((item) => (item.id === entry.id ? (result.data as CallQueueEntry) : item));
      writeCachedValue(CACHE_KEY, next);
      return next;
    });
    setNotice(`${entry.lead.business_name} saved to Supabase.`);
  }

  function change(id: string, update: Partial<CallQueueEntry>): void {
    setEntries((current) => {
      const next = current.map((entry) => (entry.id === id ? { ...entry, ...update } : entry));
      writeCachedValue(CACHE_KEY, next);
      return next;
    });
  }

  return (
    <div className="p-5 lg:p-8">
      <PageHeader
        eyebrow="AGENT 01 / PHONE-ONLY PROSPECTS"
        title="Supabase call queue."
        description="Every lead with a phone number but no website is stored here automatically. Track calls and notes without spreadsheets."
      />
      {notice && (
        <div className="mb-4 rounded-lg border border-secondary/20 bg-secondary/5 p-3 text-xs text-secondary">
          {notice}
        </div>
      )}
      <div className="panel rounded-xl p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-3 text-slate-600" size={15} />
            <input
              className="input py-2.5 pl-9 text-xs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search businesses, phone numbers, websites, addresses or notes..."
            />
          </label>
          <select
            className="input w-auto py-2.5 text-xs"
            value={filter}
            onChange={(event) => setFilter(event.target.value as "All" | CallQueueStatus)}
          >
            <option>All</option>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={() => void load()}>
            <RefreshCw className={loading ? "animate-spin" : ""} size={14} />
            REFRESH
          </button>
        </div>
      </div>

      <div className="panel mt-5 overflow-hidden rounded-xl">
        <div className="border-b border-border px-4 py-3 font-mono text-[10px] text-slate-500">
          {visible.length} CALL LEADS · STORED IN SUPABASE
        </div>
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[1220px] text-left">
            <thead className="border-b border-border bg-[#0a101b] font-mono text-[9px] text-slate-600">
              <tr>
                <th className="p-4">BUSINESS</th>
                <th>PHONE</th>
                <th>WEBSITE</th>
                <th>ADDRESS</th>
                <th>MAPS</th>
                <th>STATUS</th>
                <th>NOTES</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr key={entry.id} className="border-b border-border/70 text-xs align-top">
                  <td className="p-4 font-medium text-white">{entry.lead.business_name}</td>
                  <td className="py-4">
                    <a className="flex items-center gap-2 text-primary" href={`tel:${entry.lead.phone}`}>
                      <Phone size={12} />
                      {entry.lead.phone}
                    </a>
                  </td>
                <td className="py-4">
                  {(entry.website_url ?? entry.lead.website_url) ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-primary/20 bg-primary/10 px-2 py-1 font-mono text-[9px] text-primary">
                        HAS WEBSITE
                      </span>
                      <a
                        href={entry.website_url ?? entry.lead.website_url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-secondary"
                      >
                        <Globe2 size={12} />
                        OPEN
                      </a>
                    </div>
                  ) : (
                    <span className="rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[9px] text-slate-600">
                      NO WEBSITE
                    </span>
                  )}
                </td>
                  <td className="max-w-[240px] py-4 text-slate-500">{entry.lead.address ?? entry.lead.location}</td>
                  <td className="py-4">
                    <a href={entry.maps_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-secondary">
                      <ExternalLink size={12} />
                      OPEN
                    </a>
                  </td>
                  <td className="py-3">
                    <select
                      className="input w-36 py-2 text-xs"
                      value={entry.status}
                      onChange={(event) =>
                        change(entry.id, { status: event.target.value as CallQueueStatus })
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td className="w-[320px] py-3">
                    <textarea
                      className="input min-h-16 resize-y py-2 text-xs"
                      value={entry.notes}
                      onChange={(event) => change(entry.id, { notes: event.target.value })}
                      placeholder="Call notes..."
                    />
                  </td>
                  <td className="p-3">
                    <button className="btn btn-ghost py-2" onClick={() => void save(entry)}>
                      <Save size={13} />
                      SAVE
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && visible.length === 0 && (
          <div className="p-14 text-center font-mono text-xs text-slate-600">
            NO PHONE-ONLY LEADS MATCH THIS FILTER
          </div>
        )}
      </div>
    </div>
  );
}
