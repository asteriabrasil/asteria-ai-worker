import type { ToolResult } from "../types.js";

const MAX_BODY_BYTES = 50 * 1024; // 50 KB

export async function webFetch(
  url: string,
  headers?: Record<string, string>
): Promise<ToolResult> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "asteria-ai-worker/1.0",
        ...(headers ?? {}),
      },
    });

    const text = await response.text();
    const truncated = text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) + "\n... [truncated]" : text;

    return {
      success: response.ok,
      output: `HTTP ${response.status} ${response.statusText}\n\n${truncated}`,
      ...(response.ok ? {} : { error: `HTTP ${response.status}: ${response.statusText}` }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Fetch failed: ${message}` };
  }
}
