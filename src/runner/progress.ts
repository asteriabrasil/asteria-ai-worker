import type Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";
import type { AdoClient } from "../ado/client.js";
import type { AdoComment, Config, ProgressSnapshot, TaskContext } from "../types.js";
import { buildProgressSnapshotComment } from "../utils/markdown.js";

export const SNAPSHOT_MARKER = "<!-- asteria-ai-worker:snapshot -->";

export function findProgressSnapshot(comments: AdoComment[]): ProgressSnapshot | null {
  // Walk in reverse to find the latest snapshot
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    if (!comment) continue;

    if (comment.text.includes(SNAPSHOT_MARKER)) {
      // Extract JSON from ```json block
      const jsonMatch = comment.text.match(/```json\s*([\s\S]+?)\s*```/);
      if (jsonMatch?.[1]) {
        try {
          const snapshot = JSON.parse(jsonMatch[1]) as ProgressSnapshot;
          return snapshot;
        } catch {
          // malformed snapshot, keep looking
        }
      }
    }
  }
  return null;
}

export async function saveProgressSnapshot(
  ado: AdoClient,
  taskId: number,
  snapshot: ProgressSnapshot
): Promise<void> {
  const comment = buildProgressSnapshotComment(snapshot);
  await ado.addComment(taskId, comment);
}

export async function requestProgressSnapshot(
  client: Anthropic,
  config: Config,
  messages: MessageParam[],
  context: TaskContext,
  filesChanged: string[],
  inputTokens: number,
  outputTokens: number
): Promise<ProgressSnapshot> {
  const summaryRequest: MessageParam = {
    role: "user",
    content:
      "You have reached the token limit for this session. Please provide a concise summary of what you have accomplished so far, so that the next session can resume from this point. Focus on: (1) what was done, (2) what still needs to be done, (3) any important findings or decisions made.",
  };

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    messages: [...messages, summaryRequest],
  });

  const summaryBlock = response.content.find((b) => b.type === "text");
  const conversationSummary =
    summaryBlock?.type === "text" ? summaryBlock.text : "No summary available.";

  const snapshot: ProgressSnapshot = {
    taskId: context.task.id,
    pbiId: context.pbi.id,
    conversationSummary,
    filesChanged,
    totalInputTokens: inputTokens,
    totalOutputTokens: outputTokens,
    savedAt: new Date().toISOString(),
  };

  return snapshot;
}
