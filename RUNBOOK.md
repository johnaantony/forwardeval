# Runbook

**From a 10-minute first look to a ship decision you can defend, in eight steps.**

Written for forward-deployed engineers, who run the steps, and forward-deployed PMs, who make the calls the steps lead to. Each step says why it matters, what to run, and what counts as done. A step is done when its evidence is on disk, never because someone ticked a box, which is the same rule the verdicts follow.

> [!TIP]
> **Where am I?** After step 1, run `node scripts/runbook.mjs` from the repo root any time. It reads your files and prints which steps are done and the exact command to run next. Demo runs never count as your evidence.

## Before you start: a 10-minute look, no install

Open the [live dashboard](https://johnaantony.github.io/forwardeval/), read "How a run works", and take the tour. Then tick **Show demo runs**, open the Task explorer, and click into a failed task: the transcript on one side, the hidden test output on the other, and a classified reason for the failure. That is the whole product on one screen. Hidden tests decide, a model explains the failure afterwards, and every result has a price. Demo runs are labelled demo: their test verdicts are real, their transcripts and token counts are simulated.

## The eight steps

| # | Step | Who | Time | Done when |
|---|---|---|---|---|
| 1 | [Connect](#1-connect) | FDE | 10 min | API key in `.env`, harness installed, sanity check green |
| 2 | [Define done](#2-define-done) | FDPM decides, FDE writes | 30 min a task | Every task has a hidden suite that fails the buggy stub and passes a reference |
| 3 | [Run](#3-run) | FDE | 15 min | A real run file in `results/` |
| 4 | [Read the verdict](#4-read-the-verdict) | Both | 5 min | The run is in the dashboard: pass rate and cost per solve |
| 5 | [Explain the failures](#5-explain-the-failures) | FDE | 10 min | Every failed task carries a reason from a fixed list |
| 6 | [Record the human verdict](#6-record-the-human-verdict) | FDPM, or whoever would accept the change | 2 min a task | Every task has an accept or a reject |
| 7 | [Compare before you ship](#7-compare-before-you-ship) | FDE runs, FDPM decides | 20 min | Two real runs over the same tasks, one change between them |
| 8 | [Make it routine](#8-make-it-routine) | Both | Ongoing | A real run in the last 7 days |

The same eight steps run in [TurnEval](https://github.com/johnaantony/turneval/blob/main/RUNBOOK.md) for voice agents. Learn a step in one and you know it in the other.

**FDPMs: your moments are steps 2, 6, and 7.** Decide what the change must guarantee, say whether you would have accepted each result, and make the ship call from the comparison. Each is a judgment, not an engineering task, and the FDE can run the commands with you.

---

## 1. Connect

**Why:** prove the plumbing before spending a dollar.

You need Node 18+, Python 3.9+ (`python3` on your PATH), and an Anthropic API key.

```bash
cd harness && npm install
cp ../.env.example ../.env          # put your ANTHROPIC_API_KEY in it
node ../scripts/sanity-tasks.mjs    # no key needed: every buggy stub fails its suite, every reference passes
```

**Done when:** the key is set, the harness is installed, and the sanity check is green. `node scripts/runbook.mjs` checks the first two; the sanity check is the third.

## 2. Define done

**Why:** the verdict is only as good as the tests behind it. A task is your customer's definition of done, written as tests the agent can run but never read.

A task is a folder in `tasks/`:

| File | What it is |
|---|---|
| `task.json` | The prompt the agent gets, the entry file, and the test command |
| `solution_stub.py` | The starting code, with a real bug in it |
| `test_suite.py` | The hidden suite (`unittest`), edge cases included |

Add a reference solution at `scripts/references/<task>.py`, then confirm the stub fails and the reference passes:

```bash
node scripts/sanity-tasks.mjs
```

Or turn a real coding session into a task. Capture drafts the suite, and a person ratifies it before it counts:

```bash
cd harness && npm run capture -- --session path/to/session.json
```

**FDPM:** this is where you decide what the change must guarantee. If it cannot be said as a test, the eval cannot check it.

**Done when:** every task has a hidden suite and the sanity check passes. The 17 shipped tasks are saturated: claude-sonnet-5 passed all 17 in the first real run ([FINDINGS.md](FINDINGS.md)). The suite that tells two agents apart is the one built from your customer's code.

## 3. Run

**Why:** the agent works each task in a loop (read, edit, run the tests, react to what failed) and every step is recorded.

```bash
cd harness
npm run eval -- --model claude-sonnet-5 --label first-run
```

The 17 shipped tasks cost $0.32 on the first real run. `--only <id,id>` runs a subset. `--tests both` also runs a model-written suite in the shadow of the expert one, which is how the Judge calibration tab measures where a model judge could be trusted.

**Done when:** a real run file is in `results/`. Demo runs do not count.

## 4. Read the verdict

**Why:** the score is the exit code of the hidden suite, re-run on a clean copy of the task. A model never grades.

```bash
cd ../dashboard && npm install
npm run sync        # copies results/*.json into the dashboard
npm run dev         # open the address it prints
```

The Overview answers the ship question in one card: how many tasks passed, what each solve cost, and what the run found.

**Done when:** your run is in the dashboard.

## 5. Explain the failures

**Why:** a failure you can name is a failure you can fix, and a fixed list means the counts mean the same thing from run to run.

Open a failed task in the Task explorer: the transcript, the final test output, and a classified reason. A model writes the explanation only after the tests have ruled, and it can only choose from this list:

| Tag | What happened |
|---|---|
| `misread_spec` | Solved the wrong problem |
| `missed_edge_case` | The happy path works, an edge case fails |
| `regression` | Fixed the target but broke a test that used to pass |
| `hallucinated_api` | Used a function or module that does not exist |
| `incomplete` | Gave up, left a TODO, or did not finish |
| `wrong_approach` | A fundamentally wrong algorithm or strategy |
| `flaky_or_timeout` | Nondeterministic, or ran out of time |

**Done when:** every failed task has a reason.

## 6. Record the human verdict

**Why:** tests say the code is correct. Only the person who would ship it can say it was accepted. **Passed but rejected** (tests green, a person said no) is the cell this product exists to show you, because it means the tests are checking the wrong thing.

```bash
node scripts/outcome.mjs --task <task-id> --accepted
node scripts/outcome.mjs --task <task-id> --rejected --rework --note "why"
node scripts/outcome.mjs --list
```

Verdicts land in `outcomes.json` and are merged into the next eval run, so record them before you run again. `node scripts/runbook.mjs` names the next task without one.

**Done when:** every task has a verdict. An unrecorded verdict is a blind spot, never an acceptance.

## 7. Compare before you ship

**Why:** a new model or prompt can lift the pass rate and still break tasks that used to pass. Hold the suite constant, change one thing, and read exactly what flipped.

```bash
cd harness
npm run eval -- --model claude-fable-5 --label candidate
cd ../dashboard && npm run sync
```

Open Run comparison: the two runs side by side, the regressions (pass to fail) and improvements (fail to pass), and what each run cost.

**FDPM:** this is the ship call. Read the regressions, not the average.

**Done when:** two real runs over the same tasks exist, one change between them.

**Not built yet:** a gate command that fails a CI build when a regression appears. Today the Run comparison tab is the gate.

## 8. Make it routine

**Why:** an eval you ran once is a demo. One you run after every change is a release gate.

Rerun after every agent, prompt, or model change. Turn real sessions into tasks with `npm run capture`, so the suite grows from the customer's own work instead of going stale.

**Done when:** there is a real run from the last 7 days.

---

## Not built yet, and what to do today

| Not built | Today |
|---|---|
| A CI gate that fails on a regression | Read the regressions in Run comparison before you ship |
| Merging new verdicts into an existing run | Record verdicts before the next eval run |
| A runbook view inside the dashboard | `node scripts/runbook.mjs` |
| Voice-native views (per-stage latency) for TurnEval runs | TurnEval's own score table |

## With TurnEval

[TurnEval](https://github.com/johnaantony/turneval) runs the same eight steps for voice agents. Its scored runs export to this dashboard's run format, so a team that ships code with agents and answers calls with agents reads one screen under one rule: checks decide, models explain.
