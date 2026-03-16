import type Anthropic from "@anthropic-ai/sdk";

type Tool = Anthropic.Messages.Tool;

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path to the file to read.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at the given path. Creates parent directories if needed.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path to the file to write.",
        },
        content: {
          type: "string",
          description: "The content to write to the file.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List files and directories at the given path.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the directory to list.",
        },
        recursive: {
          type: "boolean",
          description: "If true, list all files recursively. Defaults to false.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: "Search for files matching a glob pattern within a base path.",
    input_schema: {
      type: "object",
      properties: {
        base_path: {
          type: "string",
          description: "The base directory to search in.",
        },
        pattern: {
          type: "string",
          description: "Glob pattern (e.g., '**/*.ts', 'src/**/*.cs').",
        },
      },
      required: ["base_path", "pattern"],
    },
  },
  {
    name: "run_bash",
    description:
      "Execute a bash command using Git Bash (MINGW64) on Windows. Use forward slashes in paths. Returns stdout and stderr.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute.",
        },
        cwd: {
          type: "string",
          description: "Working directory for the command. Defaults to the workspace root.",
        },
        timeout_ms: {
          type: "number",
          description: "Timeout in milliseconds. Defaults to 120000 (2 minutes).",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "git_clone",
    description: "Clone a git repository into the workspace directory. Skips if already cloned.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The git repository URL to clone.",
        },
        repo_name: {
          type: "string",
          description: "The folder name to use inside the workspace directory.",
        },
      },
      required: ["url", "repo_name"],
    },
  },
  {
    name: "git_status",
    description: "Run 'git status' in a repository directory.",
    input_schema: {
      type: "object",
      properties: {
        repo_path: {
          type: "string",
          description: "Absolute path to the repository.",
        },
      },
      required: ["repo_path"],
    },
  },
  {
    name: "git_diff",
    description: "Run 'git diff' (or 'git diff --staged') in a repository directory.",
    input_schema: {
      type: "object",
      properties: {
        repo_path: {
          type: "string",
          description: "Absolute path to the repository.",
        },
        staged: {
          type: "boolean",
          description: "If true, show staged (cached) diff. Defaults to false.",
        },
      },
      required: ["repo_path"],
    },
  },
  {
    name: "git_commit_push",
    description: "Stage all changes, commit with a message, and push to the remote branch.",
    input_schema: {
      type: "object",
      properties: {
        repo_path: {
          type: "string",
          description: "Absolute path to the repository.",
        },
        message: {
          type: "string",
          description: "The commit message.",
        },
        branch: {
          type: "string",
          description: "The remote branch to push to. Defaults to 'main'.",
        },
      },
      required: ["repo_path", "message"],
    },
  },
  {
    name: "ado_get_work_item",
    description: "Fetch a work item from Azure DevOps by its ID.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "The work item ID.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "ado_add_comment",
    description: "Add a comment to an Azure DevOps work item.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "The work item ID.",
        },
        text: {
          type: "string",
          description: "The comment text (markdown supported).",
        },
      },
      required: ["id", "text"],
    },
  },
  {
    name: "ado_update_state",
    description: "Update the state of an Azure DevOps work item.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "The work item ID.",
        },
        state: {
          type: "string",
          description: "The new state value (e.g., 'To Do', 'In Progress', 'Done', 'Quarantine').",
        },
      },
      required: ["id", "state"],
    },
  },
  {
    name: "ado_list_work_items",
    description: "Run a WIQL query and return the matching work items as JSON.",
    input_schema: {
      type: "object",
      properties: {
        wiql: {
          type: "string",
          description: "The WIQL query string.",
        },
      },
      required: ["wiql"],
    },
  },
  {
    name: "web_fetch",
    description: "Fetch a URL and return the response body as text (truncated to 50 KB).",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch.",
        },
        headers: {
          type: "object",
          description: "Optional HTTP headers to include in the request.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["url"],
    },
  },
  {
    name: "task_done",
    description:
      "Signal that the task has been completed successfully. Call this when all work is done.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "A human-readable summary of what was accomplished.",
        },
        files_changed: {
          type: "array",
          items: { type: "string" },
          description: "List of file paths that were created or modified.",
        },
      },
      required: ["summary", "files_changed"],
    },
  },
  {
    name: "task_quarantine",
    description:
      "Signal that the task cannot be completed without human intervention. Call this when blocked.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why the agent cannot proceed.",
        },
        question: {
          type: "string",
          description: "The specific question or clarification needed from the human.",
        },
      },
      required: ["reason", "question"],
    },
  },
];
