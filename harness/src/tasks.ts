import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { TaskSpec } from "./types.js";

/** Load all task specs from the tasks/ directory (each subfolder = one task). */
export async function loadTasks(tasksDir: string): Promise<
  Array<{ spec: TaskSpec; dir: string; stubCode: string }>
> {
  const entries = await readdir(tasksDir);
  const out: Array<{ spec: TaskSpec; dir: string; stubCode: string }> = [];

  for (const name of entries.sort()) {
    const dir = join(tasksDir, name);
    const s = await stat(dir).catch(() => null);
    if (!s?.isDirectory()) continue;

    const specPath = join(dir, "task.json");
    const specRaw = await readFile(specPath, "utf8").catch(() => null);
    if (!specRaw) continue;

    const spec = JSON.parse(specRaw) as TaskSpec;
    const stubCode = await readFile(join(dir, spec.entry_file), "utf8").catch(() => "");
    out.push({ spec, dir, stubCode });
  }

  if (out.length === 0) {
    throw new Error(`No tasks found in ${tasksDir}`);
  }
  return out;
}
