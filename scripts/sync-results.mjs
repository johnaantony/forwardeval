#!/usr/bin/env node
/**
 * Publish result files to the dashboard.
 *
 * Copies results/*.json into dashboard/public/results/ and writes a manifest
 * the dashboard fetches at runtime. Run after every eval (or demo generation)
 * and before deploying the dashboard.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RESULTS_DIR = join(ROOT, "results");
const PUBLIC_RESULTS = join(ROOT, "dashboard", "public", "results");

rmSync(PUBLIC_RESULTS, { recursive: true, force: true });
mkdirSync(PUBLIC_RESULTS, { recursive: true });

const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"));
const manifest = [];

for (const f of files) {
  copyFileSync(join(RESULTS_DIR, f), join(PUBLIC_RESULTS, f));
  const run = JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8"));
  manifest.push({
    runId: run.runId,
    file: f,
    label: run.config?.label ?? run.runId,
    model: run.config?.model ?? "unknown",
    startedAt: run.startedAt,
    passAt1Rate: run.summary?.passAt1Rate ?? 0,
    totalTasks: run.summary?.totalTasks ?? 0,
    demo: Boolean(run._demo),
  });
}

manifest.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
writeFileSync(join(PUBLIC_RESULTS, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`Published ${files.length} run(s) to dashboard/public/results/`);
for (const m of manifest) console.log(`  - ${m.runId} (${(m.passAt1Rate * 100).toFixed(0)}% pass@1)${m.demo ? " [demo]" : ""}`);
