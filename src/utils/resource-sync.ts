import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { createLogger } from "./logger.js";

const execAsync = promisify(exec);
const logger = createLogger();

export const RESOURCES_DIR = path.resolve(process.cwd(), ".asteria-resources");

export async function syncGlobalResources(repoUrl?: string): Promise<void> {
  if (!repoUrl) {
    logger.info("No GLOBAL_RESOURCES_REPO configured. Skipping global resources sync.");
    return;
  }

  logger.info(`Syncing global resources from ${repoUrl}...`);

  try {
    if (fs.existsSync(RESOURCES_DIR)) {
      // If the directory exists, check if it's a git repo
      if (fs.existsSync(path.join(RESOURCES_DIR, ".git"))) {
        logger.info("Updating existing global resources repository...");
        await execAsync(`git fetch && git reset --hard origin/main`, { cwd: RESOURCES_DIR });
        logger.info("Global resources updated successfully.");
      } else {
        logger.warn(`${RESOURCES_DIR} exists but is not a git repository. Recreating...`);
        fs.rmSync(RESOURCES_DIR, { recursive: true, force: true });
        await execAsync(`git clone ${repoUrl} ${RESOURCES_DIR}`);
        logger.info("Global resources cloned successfully.");
      }
    } else {
      logger.info("Cloning global resources repository...");
      await execAsync(`git clone ${repoUrl} ${RESOURCES_DIR}`);
      logger.info("Global resources cloned successfully.");
    }
  } catch (err) {
    logger.error(
      "Failed to sync global resources. Falling back to local files if available.",
      err instanceof Error ? err.message : String(err)
    );
  }
}
