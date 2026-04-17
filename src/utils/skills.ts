import fs from "fs";
import path from "path";
import { createLogger } from "./logger.js";

const logger = createLogger();

export function loadSkillsFromDir(dirPath: string): string {
  const skillsDir = path.join(dirPath, "skills");
  let skillsText = "";

  if (!fs.existsSync(skillsDir)) {
    return "";
  }

  try {
    const files = fs.readdirSync(skillsDir);
    for (const file of files) {
      if (file.endsWith(".md") || file.endsWith(".txt")) {
        const filePath = path.join(skillsDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const skillName = path.basename(file, path.extname(file));
        
        skillsText += `\n### SKILL: ${skillName}\n${content}\n`;
      }
    }
  } catch (err) {
    logger.error(`Failed to load skills from ${skillsDir}`, err instanceof Error ? err.message : String(err));
  }

  return skillsText;
}
