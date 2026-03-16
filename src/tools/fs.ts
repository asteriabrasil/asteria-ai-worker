import * as fsPromises from "node:fs/promises";
import * as nodePath from "node:path";
import { glob } from "glob";
import type { ToolResult } from "../types.js";

export async function readFile(path: string): Promise<ToolResult> {
  try {
    const content = await fsPromises.readFile(path, "utf-8");
    return { success: true, output: content };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Failed to read file: ${message}` };
  }
}

export async function writeFile(path: string, content: string): Promise<ToolResult> {
  try {
    const dir = nodePath.dirname(path);
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(path, content, "utf-8");
    return { success: true, output: `File written successfully: ${path}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Failed to write file: ${message}` };
  }
}

export async function listDirectory(path: string, recursive = false): Promise<ToolResult> {
  try {
    if (recursive) {
      const pattern = nodePath.join(path, "**", "*").replace(/\\/g, "/");
      const files = await glob(pattern, { dot: true, nodir: false });
      return { success: true, output: files.sort().join("\n") };
    }

    const entries = await fsPromises.readdir(path, { withFileTypes: true });
    const lines = entries.map((e) => {
      const indicator = e.isDirectory() ? "/" : "";
      return `${e.name}${indicator}`;
    });
    return { success: true, output: lines.join("\n") };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Failed to list directory: ${message}` };
  }
}

export async function searchFiles(basePath: string, pattern: string): Promise<ToolResult> {
  try {
    const fullPattern = nodePath.join(basePath, pattern).replace(/\\/g, "/");
    const files = await glob(fullPattern, { dot: true });
    if (files.length === 0) {
      return { success: true, output: "No files matched the pattern." };
    }
    return { success: true, output: files.sort().join("\n") };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Failed to search files: ${message}` };
  }
}
