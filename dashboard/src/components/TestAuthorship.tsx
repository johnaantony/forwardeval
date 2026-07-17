import { useMemo, useState } from "react";
import type {
  RunResult,
  TaskResult,
  TestAgreement,
  TestAuthorshipResult,
  TestOutput,
} from "../types";
import { Card, Kpi, PassPill, SectionTitle, Tag } from "../ui";
import { fmtCost, fmtTokens, pct } from "../lib";

const AGREEMENT_META: Record<
  TestAgreement,
  { label: string; tone: "slate" | "fail" | "accent"; blurb: string }
> = {
  agree_pass: { label: "Both pass", tone: "slate", blurb: "The LLM suite and the expert suite agree: the solution passes." },
  agree_fail: { label: "Both fail", tone: "slate", blurb: "The LLM suite and the expert suite agree: the solution fails." },
  llm_missed: {
    label: "LLM missed",
    tone: "fail",
    blurb:
      "The LLM-authored tests PASS this solution but the expert's tests FAIL it. The LLM did not think of an edge case the use-case expert caught. This is the false confidence an LLM-only test suite would have shipped.",
  },
  llm_stricter: {
    label: "LLM stricter",
    tone: "accent",
    blurb:
      "The LLM-authored tests FAIL this solution but the expert's tests PASS it. The LLM suite is either over-constrained or caught something the expert did not assert.",
  },
};

function AgreementBadge({ a }: { a: TestAgreement | null }) {
  if (!a) return <span className="text-slate-500">-</span>;
  const m = AGREEMENT_META[a];
  return <Tag tone={m.tone}>{m.label}</Tag>;
}

export function TestAuthorship({ run }: { run: RunResult }) {
  const ta = run.summary.testAuthorship;
  const [selected, setSelected] = useState<TaskResult | null>(null);

  const rows = useMemo(
    () => run.tasks.filter((t) => t.testAuthorship?.human && t.testAuthorship?.llm),
    [run],
  );

  if (!ta) {
    return (
      <Card className="p-8 text-center text-sm text-slate-400">
        This run used <code className="font-mono">--tests human</code> only, so there is no
        human-vs-LLM comparison. Re-run with <code className="font-mono">--tests both</code> to
        author an LLM suite alongside the expert's and compare them.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="LLM missed"
          tone={ta.llmMissed > 0 ? "fail" : "pass"}
          value={ta.llmMissed}
          sub="LLM tests passed, expert failed"
        />
        <Kpi label="Agreement" value={pct(ta.agreementRate)} sub={`${ta.agree}/${ta.comparedTasks} tasks`} />
        <Kpi label="LLM stricter" tone="warn" value={ta.llmStricter} sub="LLM failed, expert passed" />
        <Kpi
          label="Pass@1 by author"
          value={
            <span className="text-base">
              {ta.humanPassAt1} <span className="text-slate-500">vs</span> {ta.llmPassAt1}
            </span>
          }
          sub="expert vs LLM suite"
        />
        <Kpi
          label="Test cases"
          value={
            <span className="text-base">
              {ta.humanTestCount} <span className="text-slate-500">vs</span> {ta.llmTestCount}
            </span>
          }
          sub="expert vs LLM authored"
        />
        <Kpi
          label="LLM test-gen cost"
          value={`${fmtTokens(ta.testGenTokens.total)} tok`}
          sub={ta.testGenCost !== null ? fmtCost(ta.testGenCost) : "no pricing"}
        />
      </div>

      {/* Headline insight */}
      <Card className="p-4">
        <SectionTitle hint="The reason a use-case expert stays in the loop: deterministic tests are only as good as the scenarios someone thought to write.">
          Why the human expert still matters
        </SectionTitle>
        {ta.llmMissed > 0 ? (
          <p className="text-sm text-slate-300">
            On <span className="font-semibold text-fail">{ta.llmMissed}</span> of {ta.comparedTasks}{" "}
            compared tasks, the LLM-authored suite <span className="text-fail">passed a solution the
            expert's suite caught as wrong</span>. An LLM-only test process would have shipped those
            with false confidence. Verdict for this run came from the{" "}
            <span className="font-mono">{ta.verdictSource}</span> suite.
          </p>
        ) : (
          <p className="text-sm text-slate-300">
            On this run the LLM-authored suites matched the expert's verdict everywhere they were
            compared. That is a real (and useful) signal too: for these tasks, LLM-generated tests
            were sufficient. The value of the comparison is knowing <em>which</em> tasks need the
            expert, not assuming all of them do.
          </p>
        )}
      </Card>

      {/* Per-task table */}
      <Card className="overflow-hidden">
        <div className="border-b border-ink-600 px-3 py-2 text-xs text-slate-400">
          {rows.length} tasks compared · click a row to see the LLM-generated tests and both verdicts
        </div>
        <table className="w-full text-sm">
          <thead className="bg-ink-800 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Task</th>
              <th className="px-3 py-2 text-left font-medium">Expert suite</th>
              <th className="px-3 py-2 text-left font-medium">LLM suite</th>
              <th className="px-3 py-2 text-left font-medium">Agreement</th>
              <th className="px-3 py-2 text-left font-medium">Tests (expert / LLM)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const a = t.testAuthorship as TestAuthorshipResult;
              return (
                <tr
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className={`cursor-pointer border-t border-ink-700 hover:bg-ink-700/50 ${
                    a.agreement === "llm_missed" ? "bg-fail/5" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-100">{t.title}</div>
                    <div className="font-mono text-[11px] text-slate-500">{t.id}</div>
                  </td>
                  <td className="px-3 py-2"><PassPill passed={!!a.human?.verdict} /></td>
                  <td className="px-3 py-2"><PassPill passed={!!a.llm?.verdict} /></td>
                  <td className="px-3 py-2"><AgreementBadge a={a.agreement} /></td>
                  <td className="px-3 py-2 tabular-nums text-slate-300">
                    {a.human?.output.total ?? "-"} / {a.llm?.output.total ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {selected && selected.testAuthorship && (
        <Drilldown task={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Drilldown({ task, onClose }: { task: TaskResult; onClose: () => void }) {
  const a = task.testAuthorship as TestAuthorshipResult;
  const meta = a.agreement ? AGREEMENT_META[a.agreement] : null;
  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <Card className="my-8 w-full max-w-4xl p-5">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white">{task.title}</h3>
            <div className="font-mono text-[11px] text-slate-500">{task.id}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-ink-600 px-2 py-1 text-xs text-slate-300 hover:bg-ink-700"
          >
            Close
          </button>
        </div>

        {meta && (
          <div
            className={`mb-4 rounded-lg border p-3 text-sm ${
              a.agreement === "llm_missed"
                ? "border-fail/30 bg-fail/10 text-fail"
                : "border-ink-600 bg-ink-900/40 text-slate-300"
            }`}
          >
            <span className="mr-2 font-semibold">{meta.label}.</span>
            {meta.blurb}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SuitePanel title="Expert suite (hidden source)" passed={!!a.human?.verdict} output={a.human?.output} />
          <SuitePanel title="LLM-authored suite" passed={!!a.llm?.verdict} output={a.llm?.output} />
        </div>

        <div className="mt-4">
          <SectionTitle hint="What the LLM thought to test. Compare its coverage against the failures the expert suite caught.">
            LLM-generated test suite
          </SectionTitle>
          <pre className="max-h-80 overflow-auto rounded-lg border border-ink-600 bg-ink-900 p-3 text-[12px] leading-relaxed text-slate-200">
            {a.llm?.testCode ?? "(not available)"}
          </pre>
        </div>
      </Card>
    </div>
  );
}

function SuitePanel({
  title,
  passed,
  output,
}: {
  title: string;
  passed: boolean;
  output?: TestOutput;
}) {
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-900/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-200">{title}</span>
        <PassPill passed={passed} />
      </div>
      {output ? (
        <>
          <div className="text-[11px] text-slate-400">
            {output.passed}/{output.total} passing · exit {output.exitCode}
            {output.timedOut ? " · timed out" : ""}
          </div>
          <pre className="mt-2 max-h-40 overflow-auto rounded border border-ink-700 bg-ink-900 p-2 text-[11px] text-slate-300">
            {(output.stdout || output.stderr || "(no output)").slice(0, 4000)}
          </pre>
        </>
      ) : (
        <div className="text-[11px] text-slate-500">(not run)</div>
      )}
    </div>
  );
}
