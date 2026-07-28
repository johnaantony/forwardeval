#!/usr/bin/env node
/**
 * Session capture (v0.4): turn a REAL coding session into a candidate eval case.
 *
 *   real session -> capture -> draft suite -> HUMAN review -> sanity check -> suite
 *
 * The tool extracts the task and drafts assertions; a person ratifies what
 * "done" means. That review step is deliberate and non-negotiable: only the
 * human who did the work knows what the result must guarantee, and an eval
 * case whose assertions nobody ratified is a guess about intent, not a
 * measurement of it. Captured tasks are written with
 * reviewStatus: "unreviewed" and a test_suite.draft.py; promotion requires a
 * human to review the draft, rename it, flip reviewStatus, and pass the
 * sanity check (stub fails, reference passes).
 *
 * Usage:
 *   npm run capture -- --session path/to/session.json
 *     [--category bug_fix|feature_add|refactor|edge_cases|algo]
 *     [--difficulty easy|medium|hard]
 *     [--model <id>]           model used to DRAFT the suite (needs ANTHROPIC_API_KEY;
 *                              without a key a TODO template is written instead)
 *
 * Session file schema (tool-neutral by design - write an adapter from any
 * agent log format to this):
 *   {
 *     "id": "add-retry-backoff",
 *     "prompt": "what was asked, as given to the agent",
 *     "startingCode": "...",     // becomes solution_stub.py
 *     "finalCode": "...",        // becomes the reference solution
 *     "language": "python",
 *     "outcome": { "accepted": true, "note": "..." }   // optional, feeds layer 3
 *   }
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateLlmTests } from "./gen-tests.js";
import { DEFAULT_MODEL } from "./config.js";
import type { Category, Difficulty, TaskOutcome, TaskSpec } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

interface CapturedSession {
  id: string;
  prompt: string;
  startingCode: string;
  finalCode: string;
  language: "python";
  outcome?: { accepted: boolean; reworkRequired?: boolean; note?: string };
}

const CATEGORIES: Category[] = ["bug_fix", "feature_add", "refactor", "edge_cases", "algo"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

const DRAFT_HEADER = `# NEEDS_REVIEW - drafted by capture, NOT yet ratified by a human.
#
# This suite is a DRAFT of what "done" means for the captured session. Before it
# can grade anything:
#   1. Review every assertion. You did the work - does each one describe what
#      the result must actually guarantee? Add the edge cases only you know.
#   2. Rename this file to test_suite.py
#   3. In task.json, set provenance.reviewStatus to "human_reviewed"
#   4. From the repo root, run: node scripts/sanity-tasks.mjs
#      (the stub must FAIL this suite and the reference must PASS it)
#
`;

const NO_KEY_TEMPLATE = (session: CapturedSession) => `${DRAFT_HEADER}
# No ANTHROPIC_API_KEY was set, so no assertions were drafted. Write them below.
# The captured prompt was:
#
${session.prompt
  .split("\n")
  .map((l) => `#   ${l}`)
  .join("\n")}

import unittest
from solution_stub import *  # replace with explicit imports


class TestCaptured(unittest.TestCase):
    def test_replace_me(self):
        self.fail("TODO: encode what 'done' means for this session")


if __name__ == "__main__":
    unittest.main()
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessionPath = args.session;
  if (typeof sessionPath !== "string") {
    console.error("Usage: npm run capture -- --session <file.json> [--category c] [--difficulty d]");
    process.exit(1);
  }

  const raw = await readFile(resolve(sessionPath), "utf8");
  const session = JSON.parse(raw) as CapturedSession;
  for (const field of ["id", "prompt", "startingCode", "finalCode"] as const) {
    if (!session[field] || typeof session[field] !== "string") {
      console.error(`Session file is missing required field "${field}".`);
      process.exit(1);
    }
  }
  if (session.language !== "python") {
    console.error(`Only language "python" is supported today (got "${session.language}").`);
    process.exit(1);
  }

  const id = slugify(session.id);
  const category = CATEGORIES.includes(args.category as Category)
    ? (args.category as Category)
    : "feature_add";
  const difficulty = DIFFICULTIES.includes(args.difficulty as Difficulty)
    ? (args.difficulty as Difficulty)
    : "medium";

  const taskDir = join(REPO_ROOT, "tasks", id);
  if (existsSync(taskDir)) {
    console.error(`tasks/${id}/ already exists; pick a different session id.`);
    process.exit(1);
  }

  const spec: TaskSpec = {
    id,
    title: session.prompt.split("\n")[0].slice(0, 80),
    language: "python",
    category,
    difficulty,
    prompt: session.prompt,
    entry_file: "solution_stub.py",
    test_command: "python3 test_suite.py",
    hidden_files: ["test_suite.py"],
    provenance: {
      source: "captured",
      capturedAt: new Date().toISOString().slice(0, 10),
      reviewStatus: "unreviewed",
      sessionRef: session.id,
    },
  };

  // Draft the candidate suite: from the model when a key is available, else a
  // TODO template. Either way it lands as a DRAFT the human must ratify.
  let draft: string;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const model = typeof args.model === "string" ? args.model : DEFAULT_MODEL;
    console.log(`Drafting candidate suite with ${model} ...`);
    const client = new Anthropic({ apiKey });
    const gen = await generateLlmTests({
      client,
      model,
      task: spec,
      stubCode: session.startingCode,
    });
    draft = DRAFT_HEADER + "\n" + gen.testCode;
  } else {
    console.log("No ANTHROPIC_API_KEY set - writing a TODO template instead of a drafted suite.");
    draft = NO_KEY_TEMPLATE(session);
  }

  await mkdir(taskDir, { recursive: true });
  await writeFile(join(taskDir, "task.json"), JSON.stringify(spec, null, 2) + "\n");
  await writeFile(join(taskDir, "solution_stub.py"), session.startingCode);
  await writeFile(join(taskDir, "test_suite.draft.py"), draft);
  await writeFile(join(REPO_ROOT, "scripts", "references", `${id}.py`), session.finalCode);

  // Optional layer-3 outcome riding along with the session.
  if (session.outcome) {
    const outcomesPath = join(REPO_ROOT, "outcomes.json");
    let outcomes: Record<string, TaskOutcome> = {};
    try {
      outcomes = JSON.parse(await readFile(outcomesPath, "utf8"));
    } catch {
      /* fresh file */
    }
    outcomes[id] = { ...session.outcome, recordedAt: new Date().toISOString() };
    await writeFile(outcomesPath, JSON.stringify(outcomes, null, 2) + "\n");
    console.log(`Recorded session outcome (${session.outcome.accepted ? "accepted" : "rejected"}) in outcomes.json.`);
  }

  console.log(`
Captured tasks/${id}/  (provenance: captured, reviewStatus: unreviewed)

  tasks/${id}/task.json
  tasks/${id}/solution_stub.py        <- session starting code
  tasks/${id}/test_suite.draft.py     <- DRAFT assertions, needs your review
  scripts/references/${id}.py         <- session final code (reference)

Next steps (the human-ratification gate):
  1. Review and edit tasks/${id}/test_suite.draft.py - you know what "done" meant.
  2. mv tasks/${id}/test_suite.draft.py tasks/${id}/test_suite.py
  3. Set provenance.reviewStatus to "human_reviewed" in tasks/${id}/task.json
  4. node scripts/sanity-tasks.mjs   (stub must FAIL, reference must PASS)

Until then the case is a draft: unreviewed tasks are excluded from headline metrics.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
