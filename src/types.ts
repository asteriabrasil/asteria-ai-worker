// ─── Config ──────────────────────────────────────────────────────────────────

export interface RunOptions {
  agent: string;
  timeLimitHours?: number;
  taskId?: number;
}

export interface Config {
  ado: {
    org: string;
    pat: string;
    assignedTo: string;
  };
  workspace: {
    dir: string;
    bashPath: string;
  };
  tokenLimitThreshold: number;
  globalResourcesRepo?: string;
}

// ─── ADO models ──────────────────────────────────────────────────────────────

export interface AdoWorkItem {
  id: number;
  type: string;
  title: string;
  description: string | null;
  state: string;
  assignedTo: string | null;
  tags: string | null;
  parentId: number | null;
  repositoryUrl: string | null;
  acceptanceCriteria: string | null;
  iterationPath: string | null;
  areaPath: string | null;
  comments: AdoComment[];
  relations: AdoRelation[];
}

export interface AdoComment {
  id: number;
  text: string;
  createdBy: string;
  createdDate: string;
}

export interface AdoRelation {
  rel: string;
  url: string;
  attributes: Record<string, unknown>;
}

export interface WiqlResult {
  workItems: Array<{ id: number; url: string }>;
}

// ─── Agent context ────────────────────────────────────────────────────────────

export interface TaskContext {
  task: AdoWorkItem;
  pbi: AdoWorkItem;
  plan: string | null;
  resumeFromComment: string | null;
}

// ─── Agent results ────────────────────────────────────────────────────────────

export interface AgentRunResult {
  outcome: "done" | "quarantine" | "token_limit" | "error";
  message: string;
  filesChanged: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
}

// ─── Progress snapshot ────────────────────────────────────────────────────────

export interface ProgressSnapshot {
  taskId: number;
  pbiId: number;
  conversationSummary: string;
  filesChanged: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  savedAt: string;
}

// ─── Tool result ──────────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

// ─── Tool names ───────────────────────────────────────────────────────────────

export type ToolName =
  | "read_file"
  | "write_file"
  | "list_directory"
  | "search_files"
  | "run_bash"
  | "git_clone"
  | "git_status"
  | "git_diff"
  | "git_commit_push"
  | "ado_get_work_item"
  | "ado_add_comment"
  | "ado_update_state"
  | "ado_list_work_items"
  | "web_fetch"
  | "task_done"
  | "task_quarantine";

// ─── Control signals ─────────────────────────────────────────────────────────

export class TaskDoneSignal {
  readonly kind = "task_done" as const;
  constructor(
    public readonly summary: string,
    public readonly filesChanged: string[]
  ) {}
}

export class TaskQuarantineSignal {
  readonly kind = "task_quarantine" as const;
  constructor(
    public readonly reason: string,
    public readonly question: string
  ) {}
}

export class TokenLimitSignal {
  readonly kind = "token_limit" as const;
  constructor(
    public readonly inputTokens: number,
    public readonly outputTokens: number
  ) {}
}
