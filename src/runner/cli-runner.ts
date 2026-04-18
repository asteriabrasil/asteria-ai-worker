import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { Config, RunOptions, AgentRunResult, TaskContext } from "../types.js";
import { createLogger } from "../utils/logger.js";
import { loadSkillsFromDir } from "../utils/skills.js";

const logger = createLogger();

export async function runAgentCli(
  options: RunOptions,
  config: Config,
  context: TaskContext,
  cwd: string,
  configDir?: string
): Promise<AgentRunResult> {
  return new Promise((resolve) => {
    // 1. Carrega as Skills do diretório ativo (Global ou Injetado) para GARANTIR aderência
    const globalSkillsText = configDir ? loadSkillsFromDir(configDir) : "";
    const skillsInstruction = globalSkillsText 
      ? `\n## GLOBAL SKILLS & RULES (MANDATORY):\n${globalSkillsText}\n`
      : "";

    const humanReplyInstruction = context.humanReply
      ? `\n## HUMAN REPLY TO PREVIOUS QUARANTINE:\nThe user has answered your previous question/request:\n"${context.humanReply}"\nUse this information to proceed.\n`
      : "";

    // 2. Constrói a instrução para o CLI
    const instruction = `
You are the Asteria AI Worker.
Your job is to execute the following Azure DevOps Task.
${skillsInstruction}
## CONTEXT
PBI: ${context.pbi.title}
${context.pbi.description ?? ""}

Task: #${context.task.id}: ${context.task.title}
${context.task.description ?? ""}
${humanReplyInstruction}
## CRITICAL INSTRUCTIONS:
1. AUTONOMY: You MUST run completely autonomously. Do NOT prompt for human authorization or wait for interactive input. You are running in a CI/CD-like environment.
2. BRANCHING: Before making ANY code changes, you MUST create and checkout a new branch following the pattern: git checkout -b feature/task-${context.task.id}
3. IMPLEMENTATION: Do the work requested in the task, adhering strictly to the GLOBAL SKILLS.
4. DELIVERY: Commit and push your changes to the remote repository.
5. HANDSHAKE: Before you finish, you MUST create a file named exactly '.asteria-result.json' in the root of this project (${cwd}).
6. HANDSHAKE FORMAT: The file MUST contain valid JSON with the following format:
   {
     "outcome": "done" | "quarantine",
     "message": "A brief summary of what was done or why you are stuck"
   }
7. QUARANTINE PROTOCOL: Do NOT exit or finish until this file is successfully created. If you are stuck, lack permission, or require a human to answer a question, use outcome "quarantine" and put your question in the "message" field.
8. If you need additional tools, check the MCP configurations in your configuration directory.
`;

    // 3. Prepara o comando
    let command = options.agent === "claude" ? "claude" : "gemini";
    
    logger.info(`Spawning child process for agent: ${command}`);
    
    // Configuração de ambiente: Se estivermos usando configuração injetada, 
    // podemos tentar "forçar" o agente a olhar para a pasta local setando o HOME/USERPROFILE.
    // No entanto, para evitar quebrar o Git (que precisa do .gitconfig global),
    // a injeção via PROMPT (feita acima) é a garantia mais segura e estável.
    const child = spawn(command, [instruction], {
      cwd,
      shell: true,
      stdio: "pipe",
    });

    // Timeout (Limite de Horas)
    let timeoutId: NodeJS.Timeout;
    if (options.timeLimitHours) {
      const timeoutMs = options.timeLimitHours * 60 * 60 * 1000;
      timeoutId = setTimeout(() => {
        logger.error(`Time limit of ${options.timeLimitHours} hours exceeded. Killing process.`);
        child.kill();
        resolve({
          outcome: "quarantine",
          message: `Time limit of ${options.timeLimitHours} hours exceeded. Agent process killed.`,
          filesChanged: [],
          totalInputTokens: 0,
          totalOutputTokens: 0,
        });
      }, timeoutMs);
    }

    // Intercepta e formata a saída do CLI para ser bonitinha no console E no arquivo
    child.stdout.on("data", (data) => {
      logger.agentOutput(options.agent, false, data);
    });

    child.stderr.on("data", (data) => {
      logger.agentOutput(options.agent, true, data);
    });

    child.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      logger.info(`Process ${command} closed with code ${code}`);

      // 4. Lê o resultado do arquivo de contrato
      const resultFilePath = path.join(cwd, ".asteria-result.json");
      
      if (fs.existsSync(resultFilePath)) {
        try {
          const resultData = JSON.parse(fs.readFileSync(resultFilePath, "utf-8"));
          resolve({
            outcome: resultData.outcome === "done" ? "done" : "quarantine",
            message: resultData.message || "Agent finished but provided no summary message.",
            filesChanged: [],
            totalInputTokens: 0,
            totalOutputTokens: 0,
          });
        } catch (err) {
          resolve({
            outcome: "quarantine",
            message: `Agent finished, but .asteria-result.json was malformed: ${String(err)}`,
            filesChanged: [],
            totalInputTokens: 0,
            totalOutputTokens: 0,
          });
        }
      } else {
        resolve({
          outcome: "quarantine",
          message: "Agent process finished, but did not create the .asteria-result.json file to signal completion. Assuming failure.",
          filesChanged: [],
          totalInputTokens: 0,
          totalOutputTokens: 0,
        });
      }
    });

    child.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      logger.error(`Failed to start agent process: ${err.message}`);
      resolve({
        outcome: "error",
        message: `Failed to start ${command} process: ${err.message}`,
        filesChanged: [],
        totalInputTokens: 0,
        totalOutputTokens: 0,
      });
    });
  });
}
