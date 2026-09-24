import { useEffect, useState } from "react";
import type { ManifestEntry, RunResult } from "./types";
import { loadManifest, loadRun } from "./api";
import { Overview } from "./components/Overview";
import { TaskExplorer } from "./components/TaskExplorer";
import { Comparison } from "./components/Comparison";
import { TestAuthorship } from "./components/TestAuthorship";
import { TabIntro, Tour, TourLauncher, tourAlreadyTaken } from "./components/Onboarding";

const TABS = ["overview", "tasks", "authorship", "compare"] as const;
export type Tab = (typeof TABS)[number];

/**
 * Tab state lives in the URL hash (#tasks, #authorship, ...) so a link can open
 * directly on the view that proves a given finding.
 */
function tabFromHash(): Tab | null {
  const h = window.location.hash.replace(/^#\/?/, "");
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : null;
}

export default function App() {
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [runs, setRuns] = useState<Record<string, RunResult>>({});
  const [activeFile, setActiveFile] = useState<string>("");
  const [compareFile, setCompareFile] = useState<string>("");
  const [tab, setTabState] = useState<Tab>(() => tabFromHash() ?? "overview");
  /**
   * Demo runs (seeded transcripts and token counts) are hidden by default: the
   * real runs are the story. They stay one click away because the dashboard
   * must render for someone who cloned the repo and has no API key.
   */
  const [showDemo, setShowDemo] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadManifest()
      .then(async (m) => {
        setManifest(m);
        if (m.length === 0) return;
        const real = m.filter((e) => !e.demo);
        const demoOnly = real.length === 0;
        if (demoOnly) setShowDemo(true);
        const pool = demoOnly ? m : real;
        setActiveFile(pool[pool.length - 1].file);
        if (pool.length > 1) setCompareFile(pool[pool.length - 2].file);
        const loaded: Record<string, RunResult> = {};
        for (const e of m) loaded[e.file] = await loadRun(e.file);
        setRuns(loaded);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const onHash = () => {
      const t = tabFromHash();
      if (t) setTabState(t);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function setTab(t: Tab) {
    setTabState(t);
    if (tabFromHash() !== t) window.location.hash = t;
  }

  const hasDemo = manifest.some((m) => m.demo);
  const visible = showDemo ? manifest : manifest.filter((m) => !m.demo);

  /** Hiding demo runs must not leave a hidden run selected. */
  function toggleDemo(next: boolean) {
    setShowDemo(next);
    if (next) return;
    const real = manifest.filter((m) => !m.demo);
    if (real.length === 0) return;
    if (runs[activeFile]?._demo || !real.some((m) => m.file === activeFile)) {
      setActiveFile(real[real.length - 1].file);
    }
    if (!real.some((m) => m.file === compareFile)) {
      setCompareFile(real.length > 1 ? real[real.length - 2].file : "");
    }
  }

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
          <p className="max-w-2xl text-sm text-slate-400">
            Is this coding agent's change ready to ship? Real tests decide pass or fail, an LLM never
            does, and every result is priced.
          </p>
        </div>
        {visible.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <TourLauncher onStart={() => setTourStep(0)} done={tourAlreadyTaken()} />
            {hasDemo && (
              <label className="flex items-center gap-1.5 text-slate-400" title="Demo runs have real test verdicts but simulated transcripts and token counts.">
                <input
                  type="checkbox"
                  checked={showDemo}
                  onChange={(e) => toggleDemo(e.target.checked)}
                  className="accent-accent"
                />
                Show demo runs
              </label>
            )}
            <div className="flex items-center gap-2">
              <label className="text-slate-400">Run:</label>
              <select
                value={activeFile}
                onChange={(e) => setActiveFile(e.target.value)}
                className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-slate-200"
              >
                {visible.map((m) => (
                  <option key={m.file} value={m.file}>
                    {m.label} - {(m.passAt1Rate * 100).toFixed(0)}%{m.demo ? " [demo]" : ""}
                  </option>
                ))}
              </select>
            </div>
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
          <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-ink-600">
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
                      ? "Judge calibration"
                      : "Overview"}
              </button>
            ))}
          </nav>

          {(tab === "overview" || (tab === "authorship" && !active.summary.testAuthorship)) && (
            <Overview run={active} onNavigate={setTab} />
          )}
          {tab === "tasks" && (
            <>
              <TabIntro
                what="Every task the agent attempted, with its verdict, turns and token cost."
                todo="Click any row for the turn-by-turn transcript, the diff it produced, and the test output that decided it."
              />
              <TaskExplorer run={active} />
            </>
          )}
          {tab === "authorship" && active.summary.testAuthorship && (
            <>
              <TabIntro
                what="The same solutions scored twice: by the expert's hidden suite, and by a suite the model wrote from the prompt alone."
                todo="Read the band per category to see where an LLM judge could be trusted, and where the sample is too small to say."
              />
              <TestAuthorship run={active} />
            </>
          )}
          {tab === "compare" && (
            <>
              <TabIntro
                what="Two runs side by side: pass rate, cost per solve, and every task whose verdict flipped."
                todo="Read the regression list before shipping a model or prompt change - that list is the release gate."
              />
              <CompareTab
                manifest={visible}
                runs={runs}
                activeFile={activeFile}
                compareFile={compareFile}
                setCompareFile={setCompareFile}
                active={active}
                compare={compare}
                canShowDemo={hasDemo && !showDemo}
                onShowDemo={() => toggleDemo(true)}
              />
            </>
          )}
        </>
      )}

      <footer className="mt-10 border-t border-ink-700 pt-4 text-xs text-slate-500">
        ForwardEval · deterministic test verdicts · LLM used only to explain failures, never to judge them.
      </footer>

      {tourStep !== null && active && (
        <>
          {/* keeps the last step clear of the fixed tour bar */}
          <div className="h-28" />
          <Tour
            step={tourStep}
            setStep={setTourStep}
            onNavigate={setTab}
            hasAuthorship={Boolean(active.summary.testAuthorship)}
          />
        </>
      )}
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
  canShowDemo,
  onShowDemo,
}: {
  manifest: ManifestEntry[];
  runs: Record<string, RunResult>;
  activeFile: string;
  compareFile: string;
  setCompareFile: (f: string) => void;
  active: RunResult;
  compare?: RunResult;
  canShowDemo: boolean;
  onShowDemo: () => void;
}) {
  const options = manifest.filter((m) => m.file !== activeFile);
  if (options.length === 0) {
    return (
      <div className="rounded-lg border border-ink-600 bg-ink-800 p-8 text-center text-sm text-slate-400">
        <p>
          Only one run is loaded, and a comparison needs two. Run the harness again with a different{" "}
          <code className="font-mono">--model</code> or <code className="font-mono">--label</code>:
        </p>
        <code className="mt-3 inline-block rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 font-mono text-xs text-slate-300">
          npm run eval -- --model claude-haiku-4-5 --label haiku-baseline
        </code>
        {canShowDemo && (
          <p className="mt-3 text-xs">
            Want to see what a comparison looks like first?{" "}
            <button onClick={onShowDemo} className="font-medium text-accent hover:underline">
              Load the demo runs
            </button>{" "}
            - their verdicts are real, their transcripts and token counts are simulated.
          </p>
        )}
      </div>
    );
  }
  const selected = options.some((m) => m.file === compareFile) ? compareFile : "";
  /** Never compare a demo run against a real one without saying so. */
  const mixed = Boolean(compare) && runs[activeFile]?._demo !== compare?._demo;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">Compare</span>
        <span className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-slate-300">{active.config.label} (baseline)</span>
        <span className="text-slate-400">vs</span>
        <select
          value={selected}
          onChange={(e) => setCompareFile(e.target.value)}
          className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-slate-200"
        >
          <option value="">Select a run</option>
          {options.map((m) => (
            <option key={m.file} value={m.file}>
              {m.label}
              {m.demo ? " [demo]" : ""}
            </option>
          ))}
        </select>
      </div>
      {mixed && (
        <div className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
          One of these runs is <strong>demo data</strong> (real test verdicts, simulated transcripts and
          token counts) and the other is a live run. The difference between them is not a measured
          model improvement.
        </div>
      )}
      {selected && compare ? (
        <Comparison a={active} b={compare} />
      ) : (
        <div className="text-sm text-slate-400">Select a run to compare.</div>
      )}
    </div>
  );
}
