import { useEffect, useState } from "react";
import type { RunResult } from "../types";
import type { Tab } from "../App";
import { Card, SectionTitle, Tag } from "../ui";
import { fmtCost, fmtTokens } from "../lib";

/**
 * First-run comprehension layer.
 *
 * A visitor who has never seen an eval harness should be able to answer three
 * questions without reading the README: what is the verdict, how was it reached,
 * and what do I do next. Everything here derives from the loaded run - no
 * hard-coded numbers, no claims the data does not support.
 */

/** localStorage is a convenience here, never a correctness dependency. */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* private window, blocked storage: the UI still works */
  }
}

/* ------------------------------------------------------------------ verdict */

export function VerdictCard({ run }: { run: RunResult }) {
  const s = run.summary;
  const failures = s.totalTasks - s.passedAt1;
  const rejected = s.metricLayers?.outcome?.passedButRejected ?? 0;

  const verdict =
    failures > 0
      ? {
          stamp: "NOT READY",
          tone: "fail" as const,
          line: `${failures} of ${s.totalTasks} task${failures === 1 ? "" : "s"} failed the hidden suite.`,
        }
      : rejected > 0
        ? {
            stamp: "NEEDS REVIEW",
            tone: "warn" as const,
            line: `Every test passed, but a human rejected ${rejected} result${rejected === 1 ? "" : "s"}.`,
          }
        : {
            stamp: "ALL CLEAR",
            tone: "pass" as const,
            line: `All ${s.totalTasks} tasks passed the hidden suite on the first attempt.`,
          };

  const stampCls =
    verdict.tone === "pass"
      ? "border-pass/60 text-pass"
      : verdict.tone === "warn"
        ? "border-warn/60 text-warn"
        : "border-fail/60 text-fail";

  const badges = buildBadges(run);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={`-rotate-2 rounded-lg border-2 border-dashed px-4 py-2 text-center ${stampCls}`}
          role="img"
          aria-label={`Verdict: ${verdict.stamp}`}
        >
          <div className="text-[10px] uppercase tracking-widest opacity-70">Verdict</div>
          <div className="text-lg font-black uppercase tracking-wider">{verdict.stamp}</div>
        </div>
        <div className="min-w-[14rem] flex-1">
          <div className="text-sm text-slate-200">{verdict.line}</div>
          <div className="mt-1 text-xs text-slate-500">
            {run.config.model} · {run.config.label} · decided by running {s.totalTasks} hidden test
            suites, not by asking a model.
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span
                key={b.label}
                title={b.hint}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                  b.tone === "pass"
                    ? "border-pass/30 bg-pass/10 text-pass"
                    : b.tone === "fail"
                      ? "border-fail/30 bg-fail/10 text-fail"
                      : b.tone === "warn"
                        ? "border-warn/30 bg-warn/10 text-warn"
                        : "border-ink-500 bg-ink-700 text-slate-300"
                }`}
              >
                <span aria-hidden>{b.icon}</span>
                {b.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

interface Badge {
  icon: string;
  label: string;
  hint: string;
  tone?: "pass" | "fail" | "warn";
}

function buildBadges(run: RunResult): Badge[] {
  const s = run.summary;
  const out: Badge[] = [
    {
      icon: "🎯",
      label: `${s.passedAt1}/${s.totalTasks} cleared`,
      hint: "Tasks passed on the first attempt (pass@1).",
      tone: s.passAt1Rate === 1 ? "pass" : s.passAt1Rate >= 0.7 ? undefined : "fail",
    },
    {
      icon: "⚡",
      label: `${s.avgTurnsToSolve} turns avg`,
      hint: `How many read/edit/test turns a solve took, out of a cap of ${run.config.maxTurns}.`,
    },
    {
      icon: "💸",
      label: `${fmtCost(s.costPerSolve)} / solve`,
      hint: "Total spend divided by tasks solved - accuracy per dollar, not just accuracy.",
    },
    {
      icon: s.wastedTokens === 0 ? "✨" : "🗑️",
      label: s.wastedTokens === 0 ? "no wasted spend" : `${fmtTokens(s.wastedTokens)} wasted`,
      hint: "Tokens burned on tasks that never passed.",
      tone: s.wastedTokens === 0 ? "pass" : "fail",
    },
  ];

  const band = s.judgeCalibration?.overall.band;
  if (band) {
    out.push({
      icon: "⚖️",
      label: `judge: ${band.replace("_", " ")}`,
      hint: "How far an LLM-authored suite agreed with the expert suite, and therefore how much a judge can be trusted here.",
      tone: band === "autonomous" ? "pass" : band === "unsafe" ? "fail" : "warn",
    });
  }

  if (s.provenanceCounts && s.provenanceCounts.captured > 0) {
    out.push({
      icon: "🔁",
      label: `${s.provenanceCounts.captured} captured from real sessions`,
      hint: "Tasks that came out of real coding sessions rather than being invented for the suite.",
    });
  }

  if (s.passAt1Rate === 1) {
    out.push({
      icon: "⚠️",
      label: "suite saturated",
      hint: "Everything passed, so this suite can no longer separate two models. Harder tasks are the fix.",
      tone: "warn",
    });
  }

  if (run._demo) {
    out.push({
      icon: "🧪",
      label: "demo data",
      hint: "Verdicts are real; transcripts and token counts are simulated.",
      tone: "warn",
    });
  }

  return out;
}

/* ------------------------------------------------------------- how it works */

const STEPS = [
  {
    icon: "🐛",
    title: "1. Hand the agent a broken file",
    body: "Each task is a prompt plus a stub with a real bug in it. The matching test suite is hidden from the agent's file reads.",
  },
  {
    icon: "🔁",
    title: "2. It works the loop",
    body: "Read, edit, run the tests, react to what failed - with tool use, over a capped number of turns. It can run the hidden tests; it can never read them.",
  },
  {
    icon: "⚖️",
    title: "3. The tests return the verdict",
    body: "The harness re-runs the full hidden suite on a clean copy of the task. That exit code is the score. A model is used only to explain a failure, never to grade it.",
  },
];

export function HowItWorks() {
  const [open, setOpen] = useState(() => !readFlag("fe.howItWorks.collapsed"));

  function toggle() {
    const next = !open;
    setOpen(next);
    writeFlag("fe.howItWorks.collapsed", !next);
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle hint="The 30-second version of what produced the numbers below.">
          🎮 How a run works
        </SectionTitle>
        <button onClick={toggle} className="text-xs text-accent hover:underline">
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.title} className="rounded-lg border border-ink-600 bg-ink-900/40 p-3">
                <div className="text-sm font-semibold text-slate-200">
                  <span aria-hidden className="mr-1">
                    {s.icon}
                  </span>
                  {s.title}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{s.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            <strong className="text-slate-300">Your three moves:</strong> run it against your own
            repo, read the tasks that failed, then compare the new run with the last one before you
            ship.
          </p>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------- tour */

interface TourStep {
  tab: Tab;
  title: string;
  body: string;
}

const TOUR: TourStep[] = [
  {
    tab: "overview",
    title: "The scoreboard",
    body: "The verdict, what this run found, and what it cost. Every number here came from executing tests, not from asking a model whether the code looks right.",
  },
  {
    tab: "tasks",
    title: "Watch the agent work",
    body: "Every task keeps its full transcript. Open one to see each file read, each edit and each test run - and on a failure, a classified reason instead of a shrug.",
  },
  {
    tab: "authorship",
    title: "Can a judge be trusted here?",
    body: "The same solutions scored twice: once by the expert's suite, once by a suite the model wrote. The bands say where an LLM judge could gate unsupervised, and where the sample is too small to claim anything.",
  },
  {
    tab: "compare",
    title: "The release gate",
    body: "Two runs side by side, with the flip-list of tasks that went from pass to fail. That list is the thing to read before shipping a model or prompt change.",
  },
  {
    tab: "overview",
    title: "Now point it at your own code",
    body: "A task is a folder: a prompt, an entry file and a test command. Add yours, run npm run eval, and this dashboard fills with your numbers instead of these.",
  },
];

export function TourLauncher({ onStart, done }: { onStart: () => void; done: boolean }) {
  return (
    <button
      onClick={onStart}
      className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20"
    >
      {done ? "Replay tour" : "▶ 60-second tour"}
    </button>
  );
}

export function Tour({
  step,
  setStep,
  onNavigate,
  hasAuthorship,
}: {
  step: number;
  setStep: (s: number | null) => void;
  onNavigate: (tab: Tab) => void;
  hasAuthorship: boolean;
}) {
  const steps = TOUR.filter((s) => s.tab !== "authorship" || hasAuthorship);
  const current = steps[Math.min(step, steps.length - 1)];

  useEffect(() => {
    onNavigate(current.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function finish() {
    writeFlag("fe.tour.done", true);
    setStep(null);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-accent/30 bg-ink-800/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex gap-1" aria-hidden>
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${i <= step ? "bg-accent" : "bg-ink-600"}`}
            />
          ))}
        </div>
        <div className="min-w-[16rem] flex-1">
          <div className="text-sm font-semibold text-white">
            <Tag tone="accent">
              {step + 1} / {steps.length}
            </Tag>{" "}
            {current.title}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{current.body}</p>
        </div>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              Back
            </button>
          )}
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-ink-900 hover:opacity-90"
            >
              Next
            </button>
          ) : (
            <button
              onClick={finish}
              className="rounded-md bg-pass px-3 py-1.5 text-xs font-semibold text-ink-900 hover:opacity-90"
            >
              Done
            </button>
          )}
          <button
            onClick={finish}
            className="text-xs text-slate-500 hover:text-slate-300"
            aria-label="Close the tour"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

export function tourAlreadyTaken(): boolean {
  return readFlag("fe.tour.done");
}

/* --------------------------------------------------------------- tab intro */

/** One line of "what you are looking at, and what to do with it" per tab. */
export function TabIntro({ what, todo }: { what: string; todo: string }) {
  return (
    <div className="mb-3 rounded-lg border border-ink-600 bg-ink-800/60 px-3 py-2 text-xs text-slate-400">
      <span className="text-slate-300">{what}</span> <span className="text-slate-500">·</span>{" "}
      {todo}
    </div>
  );
}
