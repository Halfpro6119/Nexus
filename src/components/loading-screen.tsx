export function LoadingScreen({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="p-5 lg:p-8">
      <div className="panel overflow-hidden rounded-2xl border border-border bg-[#070b12]">
        <div className="border-b border-border bg-[#0a101b] px-5 py-4">
          <div className="h-2 w-28 animate-pulse rounded-full bg-primary/40" />
        </div>
        <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className="space-y-4">
            <div className="h-3 w-40 animate-pulse rounded-full bg-slate-800" />
            <div className="h-10 w-4/5 animate-pulse rounded-xl bg-slate-800" />
            <div className="h-4 w-full animate-pulse rounded-full bg-slate-800" />
            <div className="h-4 w-11/12 animate-pulse rounded-full bg-slate-800" />
            <div className="h-4 w-8/12 animate-pulse rounded-full bg-slate-800" />
          </div>
          <div className="rounded-2xl border border-border bg-[#0a101b] p-5">
            <div className="font-mono text-[9px] tracking-[.18em] text-slate-500">
              {title.toUpperCase()}
            </div>
            <div className="mt-4 h-4 w-5/6 animate-pulse rounded-full bg-slate-800" />
            <div className="mt-3 h-4 w-2/3 animate-pulse rounded-full bg-slate-800" />
            <div className="mt-6 space-y-3">
              <div className="h-20 animate-pulse rounded-xl bg-slate-900" />
              <div className="h-20 animate-pulse rounded-xl bg-slate-900" />
            </div>
            <div className="mt-5 text-xs text-slate-600">{subtitle}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
