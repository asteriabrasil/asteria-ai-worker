import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import type { Config, RunOptions } from "../types.js";
import { AdoClient } from "../ado/client.js";
import { AI_WORKER_WIQL } from "../ado/queries.js";
import { createLogger } from "../utils/logger.js";
import { runAgentCli } from "./cli-runner.js";
import { handleOutcome } from "./state-machine.js";
import { RESOURCES_DIR, syncGlobalResources } from "../utils/resource-sync.js";

const execAsync = promisify(exec);
const logger = createLogger();

const REPO_URL_REGEX = /https:\/\/(?:bitbucket\.org|github\.com)\/[^\s"'<>]+/i;
function extractRepoFromDescription(description: string | null): string | null {
  if (!description) return null;
  const match = description.match(REPO_URL_REGEX);
  return match ? match[0] : null;
}

export async function run(config: Config, options: RunOptions): Promise<void> {
  const ado = new AdoClient(config.ado);

  logger.step("ADO TASK SELECTION");
  logger.info(`Querying tasks assigned to: ${config.ado.assignedTo}`);
  const wiqlResult = await ado.runWiql(AI_WORKER_WIQL(config.ado.assignedTo));

  if (wiqlResult.workItems.length === 0) {
    logger.warn("No eligible 'To Do' or 'In Progress' tasks found. Exiting.");
    return;
  }

  logger.info(`Found ${wiqlResult.workItems.length} eligible task(s). Fetching details...`);
  const tasks = await Promise.all(wiqlResult.workItems.map((wi) => ado.getWorkItem(wi.id)));

  // Prioriza In Progress
  let task = tasks.find((t) => t.state === "In Progress") || tasks.find((t) => t.state === "To Do");
  if (!task) {
    logger.info("No actionable task found after filtering. Exiting.");
    return;
  }

  logger.success(`Selected task #${task.id}: "${task.title}" (state: ${task.state})`);

  if (!task.parentId) {
    logger.error(`Task #${task.id} has no parent PBI. Skipping.`);
    return;
  }

  logger.info(`Fetching parent PBI #${task.parentId}...`);
  const pbi = await ado.getWorkItem(task.parentId);
  logger.success(`PBI #${pbi.id}: "${pbi.title}"`);

  let repositoryUrl = task.repositoryUrl ?? extractRepoFromDescription(task.description) ?? extractRepoFromDescription(pbi.description);
  
  if (!repositoryUrl) {
    logger.error(`No repository URL found for Task #${task.id}. Quarantining.`);
    await ado.updateState(task.id, "Quarantine");
    await ado.addComment(task.id, "Auto-Quarantine: No repository URL found in task or PBI description.");
    return;
  }

  logger.step("WORKSPACE PREPARATION");
  const cloneDir = path.join(config.workspace.dir, `task-${task.id}`);
  
  if (fs.existsSync(cloneDir)) {
    logger.info(`Workspace directory already exists at ${cloneDir}. Cleaning up...`);
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }
  
  fs.mkdirSync(config.workspace.dir, { recursive: true });
  logger.info(`Cloning repository ${repositoryUrl} into ${cloneDir}...`);
  
  try {
    await execAsync(`git clone ${repositoryUrl} "${cloneDir}"`);
    logger.success("Repository cloned successfully.");
  } catch (err) {
    logger.error("Failed to clone repository.", String(err));
    await ado.updateState(task.id, "Quarantine");
    return;
  }

  // Lógica inteligente de Skills e MCPs
  logger.step("CONTEXT & SKILLS INJECTION");
  logger.info(`Evaluating context source for the ${options.agent.toUpperCase()} CLI...`);
  
  const machineGlobalDir = path.join(os.homedir(), options.agent === "claude" ? ".claude" : ".gemini");
  let activeConfigDir: string | undefined;
  
  if (fs.existsSync(machineGlobalDir)) {
    logger.success(`Global configuration for ${options.agent.toUpperCase()} was found on this machine (${machineGlobalDir}).`);
    logger.info(`The agent will naturally use its own global context (Skills and MCPs) from your machine.`);
    activeConfigDir = machineGlobalDir;
  } else {
    logger.warn(`Global configuration not found at ${machineGlobalDir}.`);
    logger.info(`Triggering Fallback: Syncing remote resources and injecting locally into the project...`);
    
    await syncGlobalResources(config.globalResourcesRepo);
    
    if (fs.existsSync(RESOURCES_DIR)) {
      const agentConfigDir = path.join(cloneDir, options.agent === "claude" ? ".claude" : ".gemini");
      fs.cpSync(RESOURCES_DIR, agentConfigDir, { recursive: true });
      logger.success(`Successfully copied remote global resources into local workspace as ${agentConfigDir}`);
      activeConfigDir = agentConfigDir;
    } else {
      logger.error("Remote global resources could not be synced and no local fallback is available.");
    }
  }

  // Busca e analisa histórico de comentários para pegar humanReply
  logger.info(`Fetching comments for task #${task.id}...`);
  const comments = await ado.getComments(task.id);
  task.comments = comments;

  let humanReply: string | null = null;
  // Procura de trás pra frente por [Asteria-Reply]
  for (let i = comments.length - 1; i >= 0; i--) {
    const text = comments[i]?.text || "";
    if (text.includes("[Asteria-Reply]")) {
       humanReply = text;
       logger.info("Human reply found. Injecting into context.");
       break;
    }
  }

  // Prepara estado ADO
  if (task.state === "To Do") {
    logger.info("Transitioning Task and PBI to 'In Progress'...");
    await ado.updateState(task.id, "In Progress");
    if (["New", "Approved", "Committed"].includes(pbi.state)) {
      await ado.updateState(pbi.id, "In Progress");
    }
  }

  // Prepara o contexto e executa
  const context = { task, pbi, plan: null, resumeFromComment: null, humanReply };
  
  logger.step("AGENT EXECUTION");
  logger.info(`Launching ${options.agent.toUpperCase()} CLI... Time limit: ${options.timeLimitHours ? `${options.timeLimitHours} hours` : "None"}.`);
  
  const result = await runAgentCli(options, config, context, cloneDir, activeConfigDir);

  logger.step("OUTCOME HANDLING");
  if (result.outcome === "error") {
     logger.error(`Agent finished with outcome: ERROR - ${result.message}`);
  } else {
     logger.success(`Agent finished with outcome: ${result.outcome.toUpperCase()}`);
  }
  
  await handleOutcome(ado, result, context);
}
