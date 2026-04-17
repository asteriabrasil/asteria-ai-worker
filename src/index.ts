#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { run } from "./runner/scheduler.js";
import { createLogger } from "./utils/logger.js";
import type { RunOptions } from "./types.js";

const logger = createLogger();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error(`
Usage: node dist/index.js <agent> [hours]

Arguments:
  agent    The CLI agent to use (e.g., 'claude' or 'gemini')
  hours    (Optional) Maximum time limit in hours before stopping

Example:
  node dist/index.js claude 8
`);
    process.exit(1);
  }

  const agent = args[0].toLowerCase();
  const timeLimitHours = args[1] ? parseFloat(args[1]) : undefined;

  const runOptions: RunOptions = {
    agent,
    timeLimitHours,
  };

  try {
    logger.step("INITIALIZATION");
    const config = await loadConfig();

    // Roda o agendador principal
    await run(config, runOptions);
    
    logger.success("Worker execution finished successfully.");
    process.exit(0);
  } catch (err) {
    logger.error("Fatal unhandled error", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
