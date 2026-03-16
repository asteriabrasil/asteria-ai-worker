import type { AdoClient } from "../ado/client.js";
import type { AgentRunResult, TaskContext } from "../types.js";
import { SIBLING_TASKS_WIQL } from "../ado/queries.js";
import {
  buildEvidenceComment,
  buildQuarantineComment,
  buildErrorComment,
} from "../utils/markdown.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger();

const PEDRO_MENTION = "@Pedro Nunes";

export async function handleOutcome(
  ado: AdoClient,
  result: AgentRunResult,
  context: TaskContext
): Promise<void> {
  const taskId = context.task.id;
  const pbiId = context.pbi.id;

  switch (result.outcome) {
    case "done": {
      logger.info(`Task #${taskId} completed. Posting evidence and marking Done.`);

      const evidenceComment = buildEvidenceComment(
        result.message,
        result.filesChanged,
        result.totalInputTokens,
        result.totalOutputTokens
      );
      await ado.addComment(taskId, evidenceComment);
      await ado.updateState(taskId, "Done");

      // Check if all sibling tasks are done
      const allDone = await checkAllSiblingTasksDone(ado, pbiId);
      if (allDone) {
        logger.info(`All sibling tasks done for PBI #${pbiId}. Moving PBI to Test.`);
        await ado.updateState(pbiId, "Test");
        await ado.addComment(
          pbiId,
          `${PEDRO_MENTION} all tasks are done — PBI is ready for testing.`
        );
      }
      break;
    }

    case "quarantine": {
      logger.info(`Task #${taskId} quarantined. Notifying human.`);

      const quarantineComment = buildQuarantineComment(result.message, PEDRO_MENTION);
      await ado.addComment(taskId, quarantineComment);
      await ado.updateState(taskId, "Quarantine");
      break;
    }

    case "token_limit": {
      // Progress snapshot already saved in loop.ts
      // Leave task in "In Progress" — it will resume on next run
      logger.info(
        `Task #${taskId} hit token limit. Leaving as In Progress for next run. ` +
          `(${result.totalInputTokens + result.totalOutputTokens} total tokens used)`
      );
      break;
    }

    case "error": {
      logger.error(`Task #${taskId} errored. Quarantining.`);

      const errorComment = buildErrorComment(result.message);
      await ado.addComment(taskId, errorComment);
      await ado.updateState(taskId, "Quarantine");
      break;
    }

    default: {
      const exhaustive: never = result.outcome;
      logger.error(`Unhandled outcome: ${exhaustive}`);
    }
  }
}

export async function checkAllSiblingTasksDone(
  ado: AdoClient,
  pbiId: number
): Promise<boolean> {
  try {
    const wiqlResult = await ado.runWiql(SIBLING_TASKS_WIQL(pbiId));

    if (wiqlResult.workItems.length === 0) {
      // No tagged tasks found — don't advance PBI
      return false;
    }

    const tasks = await Promise.all(wiqlResult.workItems.map((wi) => ado.getWorkItem(wi.id)));
    const allDone = tasks.every((t) => t.state === "Done");

    logger.info(
      `Sibling tasks for PBI #${pbiId}: ${tasks.length} total, ` +
        `${tasks.filter((t) => t.state === "Done").length} Done. allDone=${allDone}`
    );

    return allDone;
  } catch (err) {
    logger.error(
      "Failed to check sibling tasks:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}
