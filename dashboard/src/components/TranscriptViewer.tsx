import { useState } from "react";
import type { TaskResult, TranscriptItem } from "../types";
import { PassPill, Tag } from "../ui";
import { FAILURE_LABELS, fmtCost, fmtTokens, lineDiff } from "../lib";
import type { FailureTagName } from "../types";

export function TranscriptViewer({ task, onClose }: { task: TaskResult; onClose: () => void }) {
  const [tab, setTab] = useState<"transcript" | "diff" | "tests">("transcript");
  const a = task.attempts[task.representativeAttempt] ?? task.attempts[0];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="scroll-thin h-full w-full max-w-3xl overflow-y-auto border-l border-ink-600 bg-ink-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{task.title}</h2>
              <PassPill passed={task.passed} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
              <Tag>{task.category.replace("_", " ")}</Tag>
              <Tag>{task.difficulty}</Tag>
              <span className="font-mono">{task.id}</span>
              <span>· {a.turnsUsed} turns</span>
              <span>· {fmtTokens(a.tokens.total)} tok</span>
              <span>· {fmtCost(a.cost)}</span>
              <span>· stop: {a.stopReason}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded border border-ink-600 px-2 py-1 text-sm text-slate-300 hover:bg-ink-700">
            ✕
          </button>
        </div>

        <p className="mb-4 rounded-lg border border-ink-600 bg-ink-800 p-3 text-sm text-slate-300">
          {task.prompt}
        </p>

        {!task.passed && task.failureTags.length > 0 && (
          <div className="mb-4 rounded-lg border border-fail/30 bg-fail/10 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fail">Failure modes</div>
            <ul className="space-y-1.5">
              {task.failureTags.map((ft, i) => (
                <li key={i} className="text-sm">
                  <Tag tone="fail">{FAILURE_LABELS[ft.tag as FailureTagName] ?? ft.tag}</Tag>{" "}
                  <span className="text-slate-300">{ft.justification}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* tabs */}
        <div className="mb-3 flex gap-1 border-b border-ink-600">
          {(["transcript", "diff", "tests"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm capitalize ${
                tab === t ? "border-b-2 border-accent text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t === "diff" ? "stub → final" : t}
            </button>
          ))}
        </div>

        {tab === "transcript" && <Transcript items={a.transcript} />}
        {tab === "diff" && <Diff stub={task.stubCode} final={a.finalCode} />}
        {tab === "tests" && <TestPane out={a.finalTestOutput} />}
      </div>
    </div>
  );
}

function Transcript({ items }: { items: TranscriptItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <TranscriptRow key={i} item={it} />
      ))}
    </div>
  );
}

function TranscriptRow({ item }: { item: TranscriptItem }) {
  if (item.type === "system") {
    return <Line badge="system" color="text-slate-500" border="border-ink-600">{item.text}</Line>;
  }
  if (item.type === "assistant_text") {
    return <Line badge="assistant" color="text-accent" border="border-accent/30">{item.text}</Line>;
  }
  if (item.type === "tool_use") {
    return (
      <Line badge={`tool → ${item.tool}`} color="text-warn" border="border-warn/30">
        <pre className="whitespace-pre-wrap font-mono text-xs text-slate-300">
          {JSON.stringify(item.input, null, 2)}
        </pre>
      </Line>
    );
  }
  if (item.type === "tool_result") {
    return (
      <Line badge={`result ← ${item.tool}`} color={item.isError ? "text-fail" : "text-slate-400"} border="border-ink-600">
        <pre className="scroll-thin max-h-60 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-300">
          {item.content}
        </pre>
      </Line>
    );
  }
  // final_verification
  return (
    <Line badge="final verification (authoritative)" color={item.testOutput.exitCode === 0 ? "text-pass" : "text-fail"} border="border-ink-500">
      <div className="font-mono text-xs">
        exit_code: {item.testOutput.exitCode} · {item.testOutput.passed}/{item.testOutput.total} tests passed
      </div>
    </Line>
  );
}

function Line({
  badge,
  color,
  border,
  children,
}: {
  badge: string;
  color: string;
  border: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border ${border} bg-ink-800/60 p-3`}>
      <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${color}`}>{badge}</div>
      <div className="text-sm text-slate-200">{children}</div>
    </div>
  );
}

function Diff({ stub, final }: { stub: string; final: string }) {
  const lines = lineDiff(stub, final);
  return (
    <pre className="scroll-thin overflow-auto rounded-lg border border-ink-600 bg-ink-900 p-3 font-mono text-xs leading-relaxed">
      {lines.map((l, i) => (
        <div
          key={i}
          className={
            l.type === "add"
              ? "bg-pass/10 text-pass"
              : l.type === "del"
                ? "bg-fail/10 text-fail"
                : "text-slate-400"
          }
        >
          <span className="select-none opacity-60">{l.type === "add" ? "+ " : l.type === "del" ? "- " : "  "}</span>
          {l.text || " "}
        </div>
      ))}
    </pre>
  );
}

function TestPane({ out }: { out: TaskResult["finalTestOutput"] }) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-xs text-slate-400">
        exit_code: {out.exitCode} · {out.passed}/{out.total} passed · {out.durationMs}ms
        {out.timedOut && <span className="text-fail"> · TIMED OUT</span>}
      </div>
      <pre className="scroll-thin max-h-[60vh] overflow-auto rounded-lg border border-ink-600 bg-ink-900 p-3 font-mono text-xs text-slate-300">
        {out.stdout || "(no stdout)"}
        {out.stderr ? `\n--- stderr ---\n${out.stderr}` : ""}
      </pre>
    </div>
  );
}
