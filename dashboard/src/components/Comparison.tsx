import { useMemo } from "react";
import type { RunResult } from "../types";
import { Card, SectionTitle, Tag } from "../ui";
import { fmtCost, fmtTokens, pct } from "../lib";

export function Comparison({ a, b }: { a: RunResult; b: RunResult }) {
  const cmp = useMemo(() => diffRuns(a, b), [a, b]);

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <SectionTitle hint={`baseline = ${a.config.label} · candidate = ${b.config.label}`}>
          Run comparison: <span className="text-accent">{a.config.label}</span> →{" "}
          <span className="text-accent">{b.config.label}</span>
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <DeltaStat label="Pass@1" base={pct(a.summary.passAt1Rate)} cand={pct(b.summary.passAt1Rate)} delta={cmp.passRateDelta} fmt={(n) => `${(n * 100).toFixed(1)} pp`} good="up" />
          <DeltaStat label="Tokens / solve" base={fmtTokens(a.summary.tokensPerSolve)} cand={fmtTokens(b.summary.tokensPerSolve)} delta={b.summary.tokensPerSolve - a.summary.tokensPerSolve} fmt={(n) => `${n > 0 ? "+" : ""}${fmtTokens(Math.abs(n))}`} good="down" />
          <DeltaStat label="Cost / solve" base={fmtCost(a.summary.costPerSolve)} cand={fmtCost(b.summary.costPerSolve)} delta={(b.summary.costPerSolve ?? 0) - (a.summary.costPerSolve ?? 0)} fmt={(n) => `${n > 0 ? "+" : ""}${fmtCost(Math.abs(n))}`} good="down" />
          <DeltaStat label="Tasks passed" base={String(a.summary.passedAt1)} cand={String(b.summary.passedAt1)} delta={b.summary.passedAt1 - a.summary.passedAt1} fmt={(n) => `${n > 0 ? "+" : ""}${n}`} good="up" />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle hint="tasks that flipped fail → pass">✅ Improvements ({cmp.improvements.length})</SectionTitle>
          <FlipList ids={cmp.improvements} tone="pass" empty="No tasks improved." />
        </Card>
        <Card className="p-4">
          <SectionTitle hint="tasks that flipped pass → fail - the regressions a PM must catch before shipping">
            ⚠️ Regressions ({cmp.regressions.length})
          </SectionTitle>
          <FlipList ids={cmp.regressions} tone="fail" empty="No regressions. Safe to ship on this dimension." />
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle hint="pass-rate change per category">Per-category delta</SectionTitle>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="px-2 py-1 text-left">Category</th>
              <th className="px-2 py-1 text-right">{a.config.label}</th>
              <th className="px-2 py-1 text-right">{b.config.label}</th>
              <th className="px-2 py-1 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {cmp.categoryDeltas.map((c) => (
              <tr key={c.name} className="border-t border-ink-700">
                <td className="px-2 py-1.5 capitalize text-slate-200">{c.name.replace("_", " ")}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{pct(c.a)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{pct(c.b)}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${c.b - c.a > 0 ? "text-pass" : c.b - c.a < 0 ? "text-fail" : "text-slate-500"}`}>
                  {c.b - c.a > 0 ? "+" : ""}{((c.b - c.a) * 100).toFixed(0)} pp
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function FlipList({ ids, tone, empty }: { ids: { id: string; title: string }[]; tone: "pass" | "fail"; empty: string }) {
  if (ids.length === 0) return <div className="py-4 text-sm text-slate-500">{empty}</div>;
  return (
    <ul className="space-y-1.5">
      {ids.map((t) => (
        <li key={t.id} className="flex items-center gap-2 text-sm">
          <Tag tone={tone === "fail" ? "fail" : "accent"}>{tone === "fail" ? "pass→fail" : "fail→pass"}</Tag>
          <span className="text-slate-200">{t.title}</span>
          <span className="font-mono text-[11px] text-slate-500">{t.id}</span>
        </li>
      ))}
    </ul>
  );
}

function DeltaStat({
  label,
  base,
  cand,
  delta,
  fmt,
  good,
}: {
  label: string;
  base: string;
  cand: string;
  delta: number;
  fmt: (n: number) => string;
  good: "up" | "down";
}) {
  const improved = good === "up" ? delta > 0 : delta < 0;
  const neutral = delta === 0;
  const color = neutral ? "text-slate-500" : improved ? "text-pass" : "text-fail";
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-900/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm text-slate-300">
        <span className="text-slate-500">{base}</span> → <span className="font-semibold text-white">{cand}</span>
      </div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>{neutral ? "no change" : fmt(delta)}</div>
    </div>
  );
}

function diffRuns(a: RunResult, b: RunResult) {
  const aMap = new Map(a.tasks.map((t) => [t.id, t]));
  const improvements: { id: string; title: string }[] = [];
  const regressions: { id: string; title: string }[] = [];
  for (const tb of b.tasks) {
    const ta = aMap.get(tb.id);
    if (!ta) continue;
    if (!ta.passed && tb.passed) improvements.push({ id: tb.id, title: tb.title });
    if (ta.passed && !tb.passed) regressions.push({ id: tb.id, title: tb.title });
  }
  const cats = new Set([...Object.keys(a.summary.byCategory), ...Object.keys(b.summary.byCategory)]);
  const categoryDeltas = [...cats].map((name) => ({
    name,
    a: a.summary.byCategory[name]?.rate ?? 0,
    b: b.summary.byCategory[name]?.rate ?? 0,
  }));
  return {
    passRateDelta: b.summary.passAt1Rate - a.summary.passAt1Rate,
    improvements,
    regressions,
    categoryDeltas,
  };
}
