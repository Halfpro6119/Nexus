"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Blocks,
  Command,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  PhoneCall,
  Radio,
  ScanSearch,
  Send,
  Users,
} from "lucide-react";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/leads", label: "Lead Intelligence", icon: Users },
  { href: "/calls", label: "Call Queue", icon: PhoneCall },
  { href: "/research", label: "Lead Research", icon: FlaskConical },
  { href: "/outreach", label: "Outreach", icon: Send },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/builder", label: "Site Builder", icon: Blocks },
  { href: "/critic", label: "AI Website Critic", icon: ScanSearch },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    for (const { href } of nav) router.prefetch(href);
  }, [router]);

  return (
    <div className="min-h-screen bg-background bg-cyber-grid grid-bg">
      <div className="fixed inset-0 scanline" />
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-border bg-[#080c14]/95 px-4 py-6 lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <Command size={20} />
          </div>
          <div>
            <div className="font-mono text-sm font-semibold text-white">
              NEXUS<span className="text-primary">//</span>CORE
            </div>
            <div className="font-mono text-[9px] tracking-[.24em] text-slate-600">
              REVENUE OS
            </div>
          </div>
        </div>
        <nav className="mt-10 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === href : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                prefetch
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition ${
                  active
                    ? "border border-primary/20 bg-primary/10 text-primary"
                    : "text-slate-500 hover:bg-white/[.03] hover:text-slate-200"
                }`}
              >
                <Icon size={17} />
                <span>{label}</span>
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_#10b981]" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-xl border border-border bg-surface/70 p-4">
          <div className="flex items-center gap-2 font-mono text-[10px] text-primary">
            <Radio size={12} /> SYSTEMS NOMINAL
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded bg-slate-800">
            <div className="h-full w-[78%] bg-gradient-to-r from-primary to-secondary" />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[9px] text-slate-600">
            <span>API LOAD</span>
            <span>28%</span>
          </div>
        </div>
      </aside>
      <main className="relative z-10 min-h-screen lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/80 px-5 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-wider text-slate-500">
            <Activity size={13} className="text-primary" /> NEXUS NETWORK{" "}
            <span className="text-slate-700">/</span>{" "}
            {path === "/" ? "OVERVIEW" : path.slice(1).toUpperCase()}
          </div>
          <div className="flex items-center gap-3">
            <span className="dot" />
            <span className="font-mono text-[10px] text-slate-400">
              5 AGENTS ONLINE
            </span>
            <div className="ml-2 grid h-8 w-8 place-items-center rounded-full border border-secondary/30 bg-secondary/10 font-mono text-[10px] text-secondary">
              RX
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
