import { useEffect, useState } from "react";
import type { ManifestEntry, RunResult } from "./types";
import { loadManifest, loadRun } from "./api";
import { Overview } from "./components/Overview";
import { TaskExplorer } from "./components/TaskExplorer";
import { Comparison } from "./components/Comparison";
import { TestAuthorship } from "./components/TestAuthorship";

type Tab = "overview" | "tasks" | "authorship" | "compare";

export default function App() {
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [runs, setRuns] = useState<Record<string, RunResult>>({});
  const [activeFile, setActiveFile] = useState<string>("");
  const [compareFile, setCompareFile] = useState<string>("");
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadManifest()
      .then(async (m) => {
        setManifest(m);
        if (m.length === 0) return;
        setActiveFile(m[m.length - 1].file);
        if (m.length > 1) setCompareFile(m[0].file);
        const loaded: Record<string, RunResult> = {};
        for (const e of m) loaded[e.file] = await loadRun(e.file);
        setRuns(loaded);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const active = runs[activeFile];
  const compare = runs[compareFile];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">
            Forward<span className="text-accent">Eval</span>
          </h1>
          <p className="text-sm text-slate-400">Measure what the agent actually does: task by task, turn by turn.</p>
        </div>
        {manifest.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-400">Run:</label>
            <select
              value={activeFile}
              onChange={(e) => setActiveFile(e.target.value)}
              className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-slate-200"
            >
              {manifest.map((m) => (
                <option key={m.file} value={m.file}>
                  {m.label} - {(m.passAt1Rate * 100).toFixed(0)}%{m.demo ? " [demo]" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {error && (
        <div className="rounded-lg border border-fail/30 bg-fail/10 p-4 text-sm text-fail">
          {error} - run <code className="font-mono">node scripts/sync-results.mjs</code> to publish results.
        </div>
      )}

      {!error && manifest.length === 0 && (
        <div className="rounded-lg border border-ink-600 bg-ink-800 p-8 text-center text-slate-400">
          No runs found. Generate demo data (<code className="font-mono">node scripts/make-demo.mjs</code>) or run a
          real eval, then <code className="font-mono">node scripts/sync-results.mjs</code>.
        </div>
      )}

      {active && (
        <>
          {/* tabs */}
          <nav className="mb-5 flex gap-1 border-b border-ink-600">
            {(
              [
                "overview",
                "tasks",
                ...(active.summary.testAuthorship ? (["authorship"] as const) : []),
                "compare",
              ] as Tab[]
            ).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm capitalize ${
                  tab === t ? "border-b-2 border-accent text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t === "compare"
                  ? "Run comparison"
                  : t === "tasks"
                    ? "Task explorer"
                    : t === "authorship"
                      ? "Test authorship"
                      : "Overview"}
              </button>
            ))}
          </nav>

          {(tab === "overview" || (tab === "authorship" && !active.summary.testAuthorship)) && (
            <Overview run={active} />
          )}
          {tab === "tasks" && <TaskExplorer run={active} />}
          {tab === "authorship" && active.summary.testAuthorship && <TestAuthorship run={active} />}
          {tab === "compare" && (
            <CompareTab
              manifest={manifest}
              runs={runs}
              activeFile={activeFile}
              compareFile={compareFile}
              setCompareFile={setCompareFile}
              active={active}
              compare={compare}
            />
          )}
        </>
      )}

      <footer className="mt-10 border-t border-ink-700 pt-4 text-xs text-slate-500">
        ForwardEval · deterministic test verdicts · LLM used only to explain failures, never to judge them.
      </footer>
    </div>
  );
}

function CompareTab({
  manifest,
  runs,
  activeFile,
  compareFile,
  setCompareFile,
  active,
  compare,
}: {
  manifest: ManifestEntry[];
  runs: Record<string, RunResult>;
  activeFile: string;
  compareFile: string;
  setCompareFile: (f: string) => void;
  active: RunResult;
  compare?: RunResult;
}) {
  if (manifest.length < 2) {
    return (
      <div className="rounded-lg border border-ink-600 bg-ink-800 p-8 text-center text-slate-400">
        Need at least two runs to compare. Run the harness with a different <code className="font-mono">--model</code> or{" "}
        <code className="font-mono">--label</code>.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-400">Compare</span>
        <span className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-slate-300">{active.config.label} (baseline)</span>
        <span className="text-slate-400">vs</span>
        <select
          value={compareFile}
          onChange={(e) => setCompareFile(e.target.value)}
          className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-slate-200"
        >
          {manifest
            .filter((m) => m.file !== activeFile)
            .map((m) => (
              <option key={m.file} value={m.file}>
                {m.label}
              </option>
            ))}
        </select>
      </div>
      {compare ? (
        <Comparison a={active} b={compare} />
      ) : (
        <div className="text-sm text-slate-400">Select a run to compare.</div>
      )}
    </div>
  );
}
