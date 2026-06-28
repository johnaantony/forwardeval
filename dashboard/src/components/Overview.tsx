import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RunResult } from "../types";
import { Card, Kpi, SectionTitle, Tag } from "../ui";
import { DIFFICULTY_ORDER, FAILURE_LABELS, fmtCost, fmtTokens, pct } from "../lib";
import type { FailureTagName } from "../types";

export function Overview({ run }: { run: RunResult }) {
  const s = run.summary;

  const catData = Object.entries(s.byCategory).map(([k, v]) => ({
    name: k.replace("_", " "),
    rate: Math.round(v.rate * 100),
    passed: v.passed,
    total: v.total,
  }));

  const diffData = DIFFICULTY_ORDER.filter((d) => s.byDifficulty[d]).map((d) => ({
    name: d,
    rate: Math.round(s.byDifficulty[d].rate * 100),
    passed: s.byDifficulty[d].passed,
    total: s.byDifficulty[d].total,
  }));

  const failData = Object.entries(s.failureDistribution)
    .map(([k, v]) => ({ name: FAILURE_LABELS[k as FailureTagName] ?? k, count: v }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Kpi
          label="Pass@1"
          tone={s.passAt1Rate >= 0.7 ? "pass" : s.passAt1Rate >= 0.5 ? "warn" : "fail"}
          value={pct(s.passAt1Rate)}
          sub={`${s.passedAt1}/${s.totalTasks} tasks`}
        />
        <Kpi label="Model" value={<span className="text-base">{run.config.model}</span>} sub={run.config.label} />
        <Kpi label="Avg turns to solve" value={s.avgTurnsToSolve} sub={`cap ${run.config.maxTurns}`} />
        <Kpi label="Total tokens" value={fmtTokens(s.tokens.total)} sub={`in ${fmtTokens(s.tokens.input)} · out ${fmtTokens(s.tokens.output)}`} />
        <Kpi label="Total cost" value={fmtCost(s.cost)} sub={run.config.pricing ? "priced" : "no pricing"} />
        <Kpi label="Date" value={<span className="text-base">{run.startedAt.slice(0, 10)}</span>} sub={`harness v${run.config.harnessVersion}`} />
      </div>

      {/* Token ROI panel */}
      <Card className="p-4">
        <SectionTitle hint="Accuracy per token. Most coding benchmarks report accuracy alone; ROI asks 'better at what price?'">
          💰 Token ROI
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <RoiStat label="Tokens / solve" value={fmtTokens(s.tokensPerSolve)} hint="total tokens ÷ tasks passed" />
          <RoiStat label="Cost / solve" value={fmtCost(s.costPerSolve)} hint="total cost ÷ tasks passed" />
          <RoiStat label="Wasted (on fails)" value={`${fmtTokens(s.wastedTokens)} tok`} hint={`${fmtCost(s.wastedCost)} spent without a solve`} tone="fail" />
          <RoiStat label="Total wall-clock" value={`${(s.totalWallClockMs / 1000 / 60).toFixed(1)}m`} hint="end-to-end run time" />
        </div>
      </Card>

      {/* charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle hint="pass rate per task category">Pass rate by category</SectionTitle>
          <RateBar data={catData} />
        </Card>
        <Card className="p-4">
          <SectionTitle hint="pass rate per difficulty tier">Pass rate by difficulty</SectionTitle>
          <RateBar data={diffData} />
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle hint="across all failed tasks, showing which capability gaps dominate (from the failure classifier)">
          Failure-mode distribution
        </SectionTitle>
        {failData.length === 0 ? (
          <div className="py-8 text-center text-sm text-pass">No failures in this run 🎉</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(140, failData.length * 42)}>
            <BarChart data={failData} layout="vertical" margin={{ left: 24, right: 24 }}>
              <XAxis type="number" allowDecimals={false} stroke="#64748b" fontSize={12} />
              <YAxis type="category" dataKey="name" width={130} stroke="#94a3b8" fontSize={12} />
              <Tooltip cursor={{ fill: "#1a2230" }} contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#ff6b6b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {run._demo && (
        <div className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
          <Tag tone="accent">demo data</Tag>{" "}
          Test verdicts and test output in this run are real (Python actually executed against the hidden
          suites). Transcripts and token counts are simulated. Regenerate with a live run:{" "}
          <code className="font-mono">npm run eval</code>.
        </div>
      )}
    </div>
  );
}

const tooltipStyle = {
  background: "#111722",
  border: "1px solid #243044",
  borderRadius: 8,
  fontSize: 12,
};

function RateBar({ data }: { data: { name: string; rate: number; passed: number; total: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8 }}>
        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
        <YAxis domain={[0, 100]} unit="%" stroke="#64748b" fontSize={12} />
        <Tooltip
          cursor={{ fill: "#1a2230" }}
          contentStyle={tooltipStyle}
          formatter={(v: number, _n, p: any) => [`${v}% (${p.payload.passed}/${p.payload.total})`, "pass rate"]}
        />
        <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.rate >= 70 ? "#3ecf8e" : d.rate >= 50 ? "#e0a106" : "#ff6b6b"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function RoiStat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "fail" }) {
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-900/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${tone === "fail" ? "text-fail" : "text-white"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>
    </div>
  );
}
