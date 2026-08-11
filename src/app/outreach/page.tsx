"use client";
import { useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { readCachedValue, writeCachedValue } from "@/lib/client-cache";
import type { EmailAccount, EmailRecipient } from "@/types";
const initial = `Hi {{decision_maker_name}},\n\nI noticed {{business_name}} is delivering a strong service, but {{lead_leak}}.\n\nWe help teams turn more existing visitors into qualified conversations without increasing ad spend.\n\nWorth a 10-minute walkthrough?\n\nBest,\nRiley`;
const CACHE_KEY = "outreach:v2";
const CACHE_TTL_MS = 2 * 60 * 1000;
export default function Outreach() {
  const cached = readCachedValue<{ accounts: EmailAccount[]; recipients: EmailRecipient[]; accountId: string }>(CACHE_KEY, CACHE_TTL_MS);
  const [copy, setCopy] = useState(initial),
    [subject, setSubject] = useState(
      "Quick observation about {{business_name}}",
    ),
    [chat, setChat] = useState("Make it warmer and under 90 words."),
    [busy, setBusy] = useState(false),
    [accounts, setAccounts] = useState<EmailAccount[]>(cached?.accounts ?? []),
    [accountId, setAccountId] = useState(cached?.accountId ?? ""),
    [recipients, setRecipients] = useState<EmailRecipient[]>(cached?.recipients ?? []),
    [recipientIndex, setRecipientIndex] = useState(0),
    [notice, setNotice] = useState("");
  useEffect(() => {
    Promise.all([
      fetch("/api/email-accounts"),
      fetch("/api/outreach/recipients"),
    ])
      .then(async ([accountResponse, recipientResponse]) => {
        const accountResult = (await accountResponse.json()) as {
          data?: EmailAccount[];
        };
        const recipientResult = (await recipientResponse.json()) as {
          data?: EmailRecipient[];
        };
        const nextAccounts = accountResult.data ?? [];
        const nextRecipients = recipientResult.data ?? [];
        const nextAccountId = nextAccounts[0]?.id ?? "";
        setAccounts(nextAccounts);
        setAccountId(nextAccountId);
        setRecipients(nextRecipients);
        writeCachedValue(CACHE_KEY, {
          accounts: nextAccounts,
          recipients: nextRecipients,
          accountId: nextAccountId,
        });
      })
      .catch(() => {
        setAccounts([]);
        setRecipients([]);
      });
  }, []);
  const recipient = recipients[recipientIndex];
  async function rewrite() {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/outreach/co-writer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: chat, draft: copy }),
      });
      const j = (await r.json()) as {
        data?: { content: string };
        error?: string;
      };
      if (!r.ok || !j.data) throw new Error(j.error);
      setCopy(j.data.content);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Rewrite failed");
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setBusy(true);
    setNotice("");
    if (!recipient) {
      setNotice("No verified email recipient is selected.");
      setBusy(false);
      return;
    }
    const variables: Record<string, string> = {
      "{{decision_maker_name}}": recipient.decisionMaker.name,
      "{{business_name}}": recipient.lead.business_name,
      "{{lead_leak}}":
        recipient.enrichment.visual_design_flaws[0] ??
        recipient.enrichment.value_proposition_angle,
      "{{visual_design_flaws}}":
        recipient.enrichment.visual_design_flaws[0] ??
        recipient.enrichment.value_proposition_angle,
    };
    const compile = (value: string) =>
      Object.entries(variables).reduce(
        (v, [key, replacement]) => v.replaceAll(key, replacement),
        value,
      );
    try {
      const r = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: recipient.lead.id,
          accountId,
          to: recipient.decisionMaker.email,
          subject: compile(subject),
          body: compile(copy),
        }),
      });
      const j = (await r.json()) as {
        data?: { sent: boolean };
        error?: string;
        demo?: boolean;
      };
      if (!r.ok) throw new Error(j.error);
      setNotice(
        j.demo
          ? "Demo dispatch completed. Connect a mailbox and Supabase to send live."
          : "Email sent and lead marked Contacted.",
      );
      setRecipients((current) => {
        const next = current.filter((item) => item.lead.id !== recipient.lead.id);
        writeCachedValue(CACHE_KEY, { accounts, recipients: next, accountId });
        return next;
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="p-5 lg:p-8">
      <PageHeader
        eyebrow="AGENT 03 / PERSONALIZED OUTREACH"
        title="Write like a human. Scale like a machine."
        description="Turn enrichment signals into relevant, low-fluff outreach. Every variable is grounded in what the prospect actually needs."
        action={
          <button
            onClick={send}
            disabled={busy || !recipient || !accountId}
            className="btn btn-primary"
          >
            <Send size={14} />
            {busy ? "PROCESSING…" : "COMPILE & SEND"}
          </button>
        }
      />
      <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="mb-2 font-mono text-[9px] tracking-wider text-primary">
          VERIFIED EMAIL RECIPIENTS ONLY
        </div>
        {recipients.length ? (
          <select
            value={recipientIndex}
            onChange={(event) => setRecipientIndex(Number(event.target.value))}
            className="input text-xs"
          >
            {recipients.map((item, index) => (
              <option
                key={`${item.lead.id}-${item.decisionMaker.email}`}
                value={index}
              >
                {item.lead.business_name} · {item.decisionMaker.name} ·{" "}
                {item.decisionMaker.email}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-slate-400">
            No verified public emails are available. Leads without verified
            email addresses remain in the Supabase call queue.
          </p>
        )}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/60 p-4">
        <span className="font-mono text-[9px] text-slate-500">
          SENDING ACCOUNT
        </span>
        {accounts.length ? (
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="input max-w-xs py-2 text-xs"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email_address} · {a.provider}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-slate-500">No mailbox connected</span>
        )}
        <a href="/api/auth/gmail/connect" className="btn btn-ghost py-2">
          CONNECT GMAIL
        </a>
        <a href="/api/auth/microsoft/connect" className="btn btn-ghost py-2">
          CONNECT OUTLOOK
        </a>
        {notice && (
          <span className="ml-auto flex items-center gap-2 text-xs text-primary">
            <CheckCircle2 size={13} />
            {notice}
          </span>
        )}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <div className="panel rounded-xl">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-500/10 text-blue-400">
                <Mail size={16} />
              </div>
              <div>
                <div className="text-sm font-medium text-white">
                  Website Audit — Conversion Gap
                </div>
                <div className="mt-1 font-mono text-[9px] text-slate-600">
                  NORTHSTAR DENTAL · STEP 1 OF 3
                </div>
              </div>
            </div>
            <button className="btn btn-ghost py-2">
              VERSION 04 <ChevronDown size={12} />
            </button>
          </div>
          <div className="p-5">
            <label className="font-mono text-[9px] tracking-wider text-slate-600">
              SUBJECT
            </label>
            <input
              className="input mt-2"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <div className="mt-5 flex items-center justify-between">
              <label className="font-mono text-[9px] tracking-wider text-slate-600">
                MESSAGE
              </label>
              <span className="font-mono text-[9px] text-primary">
                LIVE VARIABLE COMPILER
              </span>
            </div>
            <textarea
              value={copy}
              onChange={(e) => setCopy(e.target.value)}
              className="input thin-scroll mt-2 min-h-[360px] resize-none font-sans text-sm leading-7 text-slate-300"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "business_name",
                "decision_maker_name",
                "lead_leak",
                "visual_design_flaws",
              ].map((x) => (
                <button
                  key={x}
                  onClick={() => setCopy((v) => v + ` {{${x}}}`)}
                  className="rounded border border-secondary/20 bg-secondary/5 px-2 py-1 font-mono text-[9px] text-secondary"
                >{`{{${x}}}`}</button>
              ))}
            </div>
          </div>
        </div>
        <aside className="panel flex min-h-[560px] flex-col rounded-xl">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <div className="relative grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Bot size={17} />
            </div>
            <div>
              <div className="text-sm font-medium text-white">
                Nexus Co-Writer
              </div>
              <div className="font-mono text-[9px] text-primary">
                GEMINI 2.5 FLASH · READY
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-4 p-4">
            <div className="max-w-[92%] rounded-lg rounded-tl-none border border-border bg-[#0b111d] p-3 text-xs leading-5 text-slate-400">
              I can tighten the message, change the angle, or adapt it to a
              specific enrichment signal.
            </div>
            <div className="ml-auto max-w-[92%] rounded-lg rounded-tr-none border border-secondary/20 bg-secondary/5 p-3 text-xs leading-5 text-slate-300">
              {chat}
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="mb-2 flex items-center gap-2 font-mono text-[9px] text-primary">
                <Sparkles size={11} />
                GROUNDING RULE
              </div>
              <p className="text-xs leading-5 text-slate-400">
                Never invent details. Lead with the strongest verified
                conversion signal.
              </p>
            </div>
          </div>
          <div className="border-t border-border p-4">
            <textarea
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              className="input h-20 resize-none text-xs"
            />
            <button
              onClick={rewrite}
              disabled={busy}
              className="btn btn-primary mt-3 w-full"
            >
              <MessageSquare size={13} />
              {busy ? "REWRITING…" : "ASK CO-WRITER"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
