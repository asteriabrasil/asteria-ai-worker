#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { run } from "./runner/scheduler.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger();

async function main(): Promise<void> {
  try {
    const config = await loadConfig();
    await run(config);
    process.exit(0);
  } catch (err) {
    logger.error("Fatal unhandled error", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
