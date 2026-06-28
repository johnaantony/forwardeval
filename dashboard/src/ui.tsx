import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-ink-600 bg-ink-800 ${className}`}>{children}</div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "pass" | "fail" | "warn";
}) {
  const toneClass =
    tone === "pass"
      ? "text-pass"
      : tone === "fail"
        ? "text-fail"
        : tone === "warn"
          ? "text-warn"
          : "text-white";
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </Card>
  );
}

export function PassPill({ passed }: { passed: boolean }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
        passed ? "bg-pass/15 text-pass" : "bg-fail/15 text-fail"
      }`}
    >
      {passed ? "PASS" : "FAIL"}
    </span>
  );
}

export function Tag({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "fail" | "accent" }) {
  const cls =
    tone === "fail"
      ? "bg-fail/10 text-fail border-fail/30"
      : tone === "accent"
        ? "bg-accent/10 text-accent border-accent/30"
        : "bg-ink-700 text-slate-300 border-ink-500";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] ${cls}`}>{children}</span>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-slate-200">{children}</h2>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
