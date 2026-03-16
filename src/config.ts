import { config as dotenvConfig } from "dotenv";
import { z } from "zod";
import type { Config } from "./types.js";

const EnvSchema = z.object({
  ADO_ORG: z.string().min(1),
  ADO_PAT: z.string().min(1),
  ADO_ASSIGNED_TO: z.string().min(1),
  ADO_PROJECT: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-6"),
  WORKSPACE_DIR: z.string().min(1),
  TOKEN_LIMIT_THRESHOLD: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 150000)),
  ANTHROPIC_MAX_TOKENS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 8192)),
  BASH_PATH: z.string().default("C:/Program Files/Git/bin/bash.exe"),
});

export async function loadConfig(): Promise<Config> {
  dotenvConfig();

  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${missing}`);
  }

  const env = parsed.data;

  return {
    ado: {
      org: env.ADO_ORG,
      pat: env.ADO_PAT,
      assignedTo: env.ADO_ASSIGNED_TO,
      project: env.ADO_PROJECT,
    },
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.CLAUDE_MODEL,
      maxTokens: env.ANTHROPIC_MAX_TOKENS,
    },
    workspace: {
      dir: env.WORKSPACE_DIR,
      bashPath: env.BASH_PATH,
    },
    tokenLimitThreshold: env.TOKEN_LIMIT_THRESHOLD,
  };
}
