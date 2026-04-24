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
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
        if (fs.existsSync(skillFile)) {
          const content = fs.readFileSync(skillFile, "utf-8");
          skillsText += `\n### SKILL: ${entry.name}\n${content}\n`;
        }
      } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))) {
        const filePath = path.join(skillsDir, entry.name);
        const content = fs.readFileSync(filePath, "utf-8");
        const skillName = path.basename(entry.name, path.extname(entry.name));
        skillsText += `\n### SKILL: ${skillName}\n${content}\n`;
      }
    }
  } catch (err) {
    logger.error(`Failed to load skills from ${skillsDir}`, err instanceof Error ? err.message : String(err));
  }

  return skillsText;
}
