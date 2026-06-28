import type { ManifestEntry, RunResult } from "./types";

const BASE = import.meta.env.BASE_URL; // "./" - portable across deploy targets

export async function loadManifest(): Promise<ManifestEntry[]> {
  const res = await fetch(`${BASE}results/manifest.json`);
  if (!res.ok) throw new Error(`Could not load results manifest (${res.status})`);
  return res.json();
}

export async function loadRun(file: string): Promise<RunResult> {
  const res = await fetch(`${BASE}results/${file}`);
  if (!res.ok) throw new Error(`Could not load run ${file} (${res.status})`);
  return res.json();
}
