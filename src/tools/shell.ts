import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Config, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

export type BashRunner = (
  command: string,
  cwd?: string,
  timeoutMs?: number
) => Promise<ToolResult>;

export function createShellTool(config: Config): BashRunner {
  const bashPath = config.workspace.bashPath;

  return async function runBash(
    command: string,
    cwd?: string,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<ToolResult> {
    // Augment PATH with Git Bash directories so git, node, etc. are available
    const gitBashBase = bashPath.replace(/\/bin\/bash\.exe$/i, "").replace(/\\bin\\bash\.exe$/i, "");
    const extraPaths = [
      `${gitBashBase}/bin`,
      `${gitBashBase}/usr/bin`,
      `${gitBashBase}/mingw64/bin`,
    ].join(":");

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${extraPaths}:${process.env["PATH"] ?? ""}`,
      MSYS_NO_PATHCONV: "1", // prevent MINGW from mangling Windows paths
      MSYS2_ARG_CONV_EXCL: "*",
    };

    try {
      const { stdout, stderr } = await execFileAsync(bashPath, ["-c", command], {
        cwd: cwd ?? process.cwd(),
        env,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        windowsHide: true,
      });

      const combinedOutput = [stdout, stderr].filter(Boolean).join("\n---stderr---\n");
      return {
        success: true,
        output: combinedOutput || "(no output)",
      };
    } catch (err) {
      const execErr = err as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
        killed?: boolean;
        signal?: string;
      };

      if (execErr.killed || execErr.signal === "SIGTERM") {
        return {
          success: false,
          output: execErr.stdout ?? "",
          error: `Command timed out after ${timeoutMs}ms`,
        };
      }

      const stdout = execErr.stdout ?? "";
      const stderr = execErr.stderr ?? "";
      const combined = [stdout, stderr].filter(Boolean).join("\n---stderr---\n");

      return {
        success: false,
        output: combined,
        error: execErr.message,
      };
    }
  };
}
