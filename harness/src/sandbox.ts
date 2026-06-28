import { spawn } from "node:child_process";
import { mkdtemp, rm, cp } from "node:fs/promises";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";

/**
 * The sandbox: every piece of candidate code and every test run executes here.
 *
 * Guarantees:
 *  - Isolated temp dir (a copy of the task folder - the real task is never mutated).
 *  - Hard timeout; the whole process tree is killed on expiry.
 *  - Best-effort OS-level network denial (defense in depth):
 *      macOS  -> sandbox-exec with a "deny network*" profile
 *      Linux  -> unshare -n (no network namespace), if permitted
 *    If neither is available, falls back to a plain subprocess and reports
 *    sandboxMode: "none" so the run file is honest about isolation strength.
 *  - Candidate code is NEVER eval()'d in the harness process.
 */

export interface SandboxRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  sandboxMode: SandboxMode;
}

export type SandboxMode = "sandbox-exec" | "unshare" | "none";

const MACOS_NO_NETWORK_PROFILE =
  "(version 1)(allow default)(deny network-outbound)(deny network-inbound)";

let cachedMode: SandboxMode | null = null;

/** Probe once which OS sandbox wrapper actually works on this machine. */
async function detectSandboxMode(): Promise<SandboxMode> {
  if (cachedMode) return cachedMode;
  if (platform() === "darwin") {
    const ok = await probe("sandbox-exec", [
      "-p",
      MACOS_NO_NETWORK_PROFILE,
      "true",
    ]);
    cachedMode = ok ? "sandbox-exec" : "none";
  } else if (platform() === "linux") {
    const ok = await probe("unshare", ["-n", "true"]);
    cachedMode = ok ? "unshare" : "none";
  } else {
    cachedMode = "none";
  }
  return cachedMode;
}

function probe(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd, args, { stdio: "ignore" });
      p.on("error", () => resolve(false));
      p.on("close", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

/** Wrap a shell command with the chosen OS sandbox. */
function buildInvocation(
  mode: SandboxMode,
  command: string,
): { file: string; args: string[] } {
  if (mode === "sandbox-exec") {
    return {
      file: "sandbox-exec",
      args: ["-p", MACOS_NO_NETWORK_PROFILE, "sh", "-c", command],
    };
  }
  if (mode === "unshare") {
    return { file: "unshare", args: ["-n", "sh", "-c", command] };
  }
  return { file: "sh", args: ["-c", command] };
}

/**
 * Copy a task folder into a fresh temp dir, run `command` there, return output.
 * The caller may pass `mutate` to overwrite files (e.g. the agent's edits)
 * before running.
 */
export async function runInSandbox(opts: {
  sourceDir: string;
  command: string;
  timeoutMs: number;
  /** files to overwrite in the sandbox copy before running: path(rel) -> contents */
  overlay?: Record<string, string>;
}): Promise<SandboxRunResult & { workDir: string }> {
  const mode = await detectSandboxMode();
  const workDir = await mkdtemp(join(tmpdir(), "forwardeval-"));
  try {
    await cp(opts.sourceDir, workDir, { recursive: true });
    if (opts.overlay) {
      const { writeFile } = await import("node:fs/promises");
      for (const [rel, contents] of Object.entries(opts.overlay)) {
        await writeFile(join(workDir, rel), contents, "utf8");
      }
    }
    const res = await execOnce(mode, opts.command, workDir, opts.timeoutMs);
    return { ...res, workDir };
  } finally {
    // best-effort cleanup
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function execOnce(
  mode: SandboxMode,
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<SandboxRunResult> {
  const { file, args } = buildInvocation(mode, command);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd,
      // Minimal, network-unfriendly env. We strip proxy vars and don't inherit
      // anything the test doesn't need. PATH is required to find python3/sh.
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
        HOME: cwd,
        PYTHONDONTWRITEBYTECODE: "1",
        LC_ALL: "C.UTF-8",
        LANG: "C.UTF-8",
      },
      detached: true, // own process group, so we can kill the whole tree
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const MAX = 200_000; // cap captured output to keep result files sane

    child.stdout?.on("data", (d) => {
      if (stdout.length < MAX) stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      if (stderr.length < MAX) stderr += d.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr + `\n[sandbox spawn error] ${String(err)}`,
        exitCode: 127,
        timedOut,
        durationMs: Date.now() - started,
        sandboxMode: mode,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: timedOut ? 124 : (code ?? 1),
        timedOut,
        durationMs: Date.now() - started,
        sandboxMode: mode,
      });
    });
  });
}

export async function currentSandboxMode(): Promise<SandboxMode> {
  return detectSandboxMode();
}

/**
 * Run a command inside an existing directory (no copy, no cleanup).
 * Used for the agent's own run_tests calls against its live workspace, and
 * still wrapped in the OS sandbox (network denial + timeout + kill tree).
 */
export async function execInDir(opts: {
  dir: string;
  command: string;
  timeoutMs: number;
}): Promise<SandboxRunResult> {
  const mode = await detectSandboxMode();
  return execOnce(mode, opts.command, opts.dir, opts.timeoutMs);
}
