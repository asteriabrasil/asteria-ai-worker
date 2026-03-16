import * as nodePath from "node:path";
import * as fsPromises from "node:fs/promises";
import type { ToolResult } from "../types.js";
import type { BashRunner } from "./shell.js";

export function createGitTools(runBash: BashRunner, workspaceDir: string) {
  async function gitClone(url: string, repoName: string): Promise<ToolResult> {
    const targetPath = nodePath.join(workspaceDir, repoName).replace(/\\/g, "/");

    try {
      await fsPromises.access(targetPath);
      // Directory already exists — skip clone
      return {
        success: true,
        output: `Repository already exists at ${targetPath}, skipping clone.`,
      };
    } catch {
      // Directory does not exist — proceed with clone
    }

    await fsPromises.mkdir(workspaceDir, { recursive: true });
    return runBash(`git clone "${url}" "${targetPath}"`, workspaceDir);
  }

  async function gitStatus(repoPath: string): Promise<ToolResult> {
    return runBash("git status", repoPath);
  }

  async function gitDiff(repoPath: string, staged = false): Promise<ToolResult> {
    const stagedFlag = staged ? "--staged" : "";
    return runBash(`git diff ${stagedFlag}`.trim(), repoPath);
  }

  async function gitCommitPush(
    repoPath: string,
    message: string,
    branch = "main"
  ): Promise<ToolResult> {
    const escapedMessage = message.replace(/"/g, '\\"');
    const command = [
      "git add -A",
      `git commit -m "${escapedMessage}"`,
      `git push origin ${branch}`,
    ].join(" && ");
    return runBash(command, repoPath);
  }

  return { gitClone, gitStatus, gitDiff, gitCommitPush };
}
