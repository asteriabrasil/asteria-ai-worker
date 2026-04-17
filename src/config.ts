import fs from "fs";
import path from "path";
import { z } from "zod";
import type { Config } from "./types.js";

const SETTINGS_PATH = path.resolve(process.cwd(), "config", "settings.json");

const ConfigSchema = z.object({
  ado: z.object({
    org: z.string().min(1, "ADO Org is required"),
    pat: z.string().min(1, "ADO PAT is required"),
    assignedTo: z.string().min(1, "ADO AssignedTo email is required"),
  }),
  workspace: z.object({
    dir: z.string().min(1, "Workspace directory is required"),
    bashPath: z.string().default("C:/Program Files/Git/bin/bash.exe"),
  }),
  tokenLimitThreshold: z.number().default(150000),
  globalResourcesRepo: z.string().optional(),
});

export async function loadConfig(): Promise<Config> {
  if (!fs.existsSync(SETTINGS_PATH)) {
    throw new Error(
      `Configuration file not found at ${SETTINGS_PATH}\n` +
      `Please create this file based on the instructions in the README.`
    );
  }

  let content: string;
  let json: unknown;

  try {
    content = fs.readFileSync(SETTINGS_PATH, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read settings.json: ${String(err)}`);
  }

  try {
    json = JSON.parse(content);
  } catch (err) {
    throw new Error(`Invalid JSON format in settings.json: ${String(err)}`);
  }

  const parsed = ConfigSchema.safeParse(json);

  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${missing}`);
  }

  return parsed.data;
}
