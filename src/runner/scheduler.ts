import Anthropic from "@anthropic-ai/sdk";
import type { Config, AdoWorkItem } from "../types.js";
import { AdoClient } from "../ado/client.js";
import { AI_WORKER_WIQL } from "../ado/queries.js";
import { ToolRegistry } from "../agent/tool-registry.js";
import { runAgentLoop } from "../agent/loop.js";
import { handleOutcome } from "./state-machine.js";
import { findProgressSnapshot } from "./progress.js";
import { createLogger } from "../utils/logger.js";
import { buildQuarantineComment } from "../utils/markdown.js";

const logger = createLogger();

// Regex to extract a repo URL from HTML description text
const REPO_URL_REGEX = /https:\/\/(?:bitbucket\.org|github\.com)\/[^\s"'<>]+/i;

function extractRepoFromDescription(description: string | null): string | null {
  if (!description) return null;
  const match = description.match(REPO_URL_REGEX);
  return match ? match[0] : null;
}

function selectTask(tasks: AdoWorkItem[]): AdoWorkItem | null {
  // Prioritize "In Progress" over "To Do"
  const inProgress = tasks.find((t) => t.state === "In Progress");
  if (inProgress) return inProgress;
  const toDo = tasks.find((t) => t.state === "To Do");
  return toDo ?? null;
}

export async function run(config: Config): Promise<void> {
  logger.info("Starting AI worker run...");

  const ado = new AdoClient(config.ado);
  const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

  // 1. Fetch eligible tasks
  logger.info(`Querying tasks assigned to: ${config.ado.assignedTo}`);
  const wiqlResult = await ado.runWiql(AI_WORKER_WIQL(config.ado.assignedTo));

  if (wiqlResult.workItems.length === 0) {
    logger.info("No eligible tasks found. Exiting.");
    return;
  }

  logger.info(`Found ${wiqlResult.workItems.length} eligible task(s). Fetching details...`);
  const tasks = await Promise.all(wiqlResult.workItems.map((wi) => ado.getWorkItem(wi.id)));

  // 2. Select task
  const task = selectTask(tasks);
  if (!task) {
    logger.info("No actionable task found after filtering. Exiting.");
    return;
  }

  logger.info(`Selected task #${task.id}: "${task.title}" (state: ${task.state})`);

  // 3. Fetch parent PBI
  if (!task.parentId) {
    logger.warn(`Task #${task.id} has no parent PBI. Quarantining.`);
    await ado.addComment(
      task.id,
      buildQuarantineComment(
        "This task has no parent PBI. The agent requires a parent PBI for context.",
        "@Pedro Nunes"
      )
    );
    await ado.updateState(task.id, "Quarantine");
    return;
  }

  logger.info(`Fetching parent PBI #${task.parentId}...`);
  const pbi = await ado.getWorkItem(task.parentId);
  logger.info(`PBI #${pbi.id}: "${pbi.title}" (state: ${pbi.state})`);

  // 4. Determine repository URL
  let repositoryUrl =
    task.repositoryUrl ?? extractRepoFromDescription(task.description);

  if (!repositoryUrl) {
    // Try extracting from PBI description as fallback
    repositoryUrl = extractRepoFromDescription(pbi.description);
  }

  if (!repositoryUrl && task.state === "To Do") {
    logger.warn(`Task #${task.id} has no repository URL and is in 'To Do'. Quarantining.`);
    await ado.addComment(
      task.id,
      buildQuarantineComment(
        "No repository URL found in the task or parent PBI. Please add the repository URL to the Custom.RepositoryUrl field or mention it in the description.",
        "@Pedro Nunes"
      )
    );
    await ado.updateState(task.id, "Quarantine");
    return;
  }

  // Attach resolved repo URL back to the task object for context
  if (repositoryUrl && !task.repositoryUrl) {
    task.repositoryUrl = repositoryUrl;
  }

  // 5. Transition states if task is "To Do"
  if (task.state === "To Do") {
    logger.info(`Transitioning task #${task.id} to In Progress.`);
    await ado.updateState(task.id, "In Progress");
    task.state = "In Progress";

    const pbiAdvanceStates = ["New", "Approved", "Committed"];
    if (pbiAdvanceStates.includes(pbi.state)) {
      logger.info(`Transitioning PBI #${pbi.id} to In Progress (was ${pbi.state}).`);
      await ado.updateState(pbi.id, "In Progress");
      pbi.state = "In Progress";
    }
  }

  // 6. Check for progress snapshot (resume support)
  logger.info(`Fetching comments for task #${task.id} to check for progress snapshot...`);
  const comments = await ado.getComments(task.id);
  task.comments = comments;

  const snapshot = findProgressSnapshot(comments);
  const resumeFromComment = snapshot
    ? `**Saved at:** ${snapshot.savedAt}\n\n**Summary:** ${snapshot.conversationSummary}\n\n**Files changed so far:** ${snapshot.filesChanged.join(", ") || "none"}`
    : null;

  if (snapshot) {
    logger.info(`Found progress snapshot from ${snapshot.savedAt}. Resuming.`);
  }

  // 7. Build context and registry
  const context = {
    task,
    pbi,
    plan: null,
    resumeFromComment,
  };

  const toolRegistry = new ToolRegistry(config, ado);

  // 8. Run agent loop
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const onTokenUpdate = (inp: number, out: number): void => {
    totalInputTokens = inp;
    totalOutputTokens = out;
    logger.debug(`Token update: in=${inp}, out=${out}, total=${inp + out}`);
  };

  logger.info(`Starting agent loop for task #${task.id}...`);

  let result;
  try {
    result = await runAgentLoop(
      anthropic,
      config,
      context,
      toolRegistry,
      ado,
      onTokenUpdate
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error("Agent loop threw an unhandled error:", message);
    result = {
      outcome: "error" as const,
      message,
      filesChanged: [],
      totalInputTokens,
      totalOutputTokens,
    };

    // Try to post the error as a comment
    try {
      const { buildErrorComment } = await import("../utils/markdown.js");
      await ado.addComment(task.id, buildErrorComment(message, stack));
    } catch {
      // ignore secondary failure
    }
  }

  logger.info(
    `Agent loop finished. outcome=${result.outcome}, ` +
      `total_tokens=${result.totalInputTokens + result.totalOutputTokens}`
  );

  // 9. Handle outcome
  await handleOutcome(ado, result, context);

  logger.info("AI worker run complete.");
}
