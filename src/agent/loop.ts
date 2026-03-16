import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";
import type { Config, AgentRunResult, TaskContext, ToolName } from "../types.js";
import { TaskDoneSignal, TaskQuarantineSignal } from "../types.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { AdoClient } from "../ado/client.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { requestProgressSnapshot, saveProgressSnapshot } from "../runner/progress.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger();

export async function runAgentLoop(
  client: Anthropic,
  config: Config,
  context: TaskContext,
  toolRegistry: ToolRegistry,
  adoClient: AdoClient,
  onTokenUpdate: (inp: number, out: number) => void
): Promise<AgentRunResult> {
  const systemPrompt = buildSystemPrompt(context);
  const messages: MessageParam[] = [
    {
      role: "user",
      content: `Start executing Task #${context.task.id}: ${context.task.title}. Begin by reading the task description carefully, then post an execution plan as a comment on the task, and then proceed to implement it.`,
    },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const filesChanged: string[] = [];

  while (true) {
    logger.info(`Calling Claude API (total tokens so far: ${totalInputTokens + totalOutputTokens})`);

    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: config.anthropic.maxTokens,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    onTokenUpdate(totalInputTokens, totalOutputTokens);

    logger.info(
      `Response: stop_reason=${response.stop_reason}, ` +
        `tokens: in=${inputTokens} out=${outputTokens} ` +
        `(cumulative: ${totalInputTokens + totalOutputTokens})`
    );

    // Append assistant message
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      // No tool calls — Claude stopped on its own without calling task_done/task_quarantine
      const textBlock = response.content.find((b) => b.type === "text");
      const message = textBlock?.type === "text" ? textBlock.text : "Agent ended without a signal.";
      logger.warn("Agent reached end_turn without calling task_done or task_quarantine.");
      return {
        outcome: "quarantine",
        message: `Agent ended without a completion signal. Last message: ${message}`,
        filesChanged,
        totalInputTokens,
        totalOutputTokens,
      };
    }

    if (response.stop_reason !== "tool_use") {
      logger.warn(`Unexpected stop_reason: ${response.stop_reason}`);
      return {
        outcome: "quarantine",
        message: `Unexpected stop_reason: ${response.stop_reason}`,
        filesChanged,
        totalInputTokens,
        totalOutputTokens,
      };
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const toolResultContents: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      if (block.type !== "tool_use") continue;

      const toolName = block.name as ToolName;
      const toolInput = block.input as Record<string, unknown>;

      logger.info(`Tool call: ${toolName}`, JSON.stringify(toolInput).slice(0, 200));

      let resultContent: string;
      let isError = false;

      try {
        const result = await toolRegistry.dispatch(toolName, toolInput);

        if (result instanceof TaskDoneSignal) {
          logger.info("Task done signal received.");
          filesChanged.push(...result.filesChanged);
          return {
            outcome: "done",
            message: result.summary,
            filesChanged,
            totalInputTokens,
            totalOutputTokens,
          };
        }

        if (result instanceof TaskQuarantineSignal) {
          logger.info("Task quarantine signal received.");
          return {
            outcome: "quarantine",
            message: `${result.reason}\n\nQuestion: ${result.question}`,
            filesChanged,
            totalInputTokens,
            totalOutputTokens,
          };
        }

        // ToolResult
        if (!result.success) {
          isError = true;
          resultContent = result.error ?? result.output ?? "Unknown error";
        } else {
          resultContent = result.output;
        }

        // Track file changes from write operations
        if (toolName === "write_file" && result.success && toolInput["path"]) {
          const p = toolInput["path"] as string;
          if (!filesChanged.includes(p)) filesChanged.push(p);
        }
      } catch (err) {
        isError = true;
        resultContent = err instanceof Error ? err.message : String(err);
        logger.error(`Tool dispatch error for ${toolName}:`, resultContent);
      }

      toolResultContents.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: resultContent,
        is_error: isError,
      });
    }

    // Append tool results as a user message
    messages.push({
      role: "user",
      content: toolResultContents,
    });

    // Check token limit
    if (totalInputTokens + totalOutputTokens >= config.tokenLimitThreshold) {
      logger.warn(
        `Token limit reached (${totalInputTokens + totalOutputTokens} >= ${config.tokenLimitThreshold}). Saving snapshot.`
      );

      try {
        const snapshot = await requestProgressSnapshot(
          client,
          config,
          messages,
          context,
          filesChanged,
          totalInputTokens,
          totalOutputTokens
        );
        await saveProgressSnapshot(adoClient, context.task.id, snapshot);
      } catch (snapshotErr) {
        logger.error(
          "Failed to save progress snapshot:",
          snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr)
        );
      }

      return {
        outcome: "token_limit",
        message: `Token limit of ${config.tokenLimitThreshold} reached. Progress snapshot saved.`,
        filesChanged,
        totalInputTokens,
        totalOutputTokens,
      };
    }
  }
}
