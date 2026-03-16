import type { Config, ToolName, ToolResult, TaskDoneSignal, TaskQuarantineSignal } from "../types.js";
import type { AdoClient } from "../ado/client.js";
import { createShellTool } from "../tools/shell.js";
import { createGitTools } from "../tools/git.js";
import { readFile, writeFile, listDirectory, searchFiles } from "../tools/fs.js";
import { adoGetWorkItem, adoAddComment, adoUpdateState, adoListWorkItems } from "../tools/ado.js";
import { webFetch } from "../tools/web.js";
import { taskDone, taskQuarantine } from "../tools/control.js";

export class ToolRegistry {
  private readonly runBash: ReturnType<typeof createShellTool>;
  private readonly git: ReturnType<typeof createGitTools>;

  constructor(
    private readonly config: Config,
    private readonly adoClient: AdoClient
  ) {
    this.runBash = createShellTool(config);
    this.git = createGitTools(this.runBash, config.workspace.dir);
  }

  async dispatch(
    name: ToolName,
    input: Record<string, unknown>
  ): Promise<ToolResult | TaskDoneSignal | TaskQuarantineSignal> {
    switch (name) {
      case "read_file":
        return readFile(input["path"] as string);

      case "write_file":
        return writeFile(input["path"] as string, input["content"] as string);

      case "list_directory":
        return listDirectory(input["path"] as string, input["recursive"] as boolean | undefined);

      case "search_files":
        return searchFiles(input["base_path"] as string, input["pattern"] as string);

      case "run_bash":
        return this.runBash(
          input["command"] as string,
          input["cwd"] as string | undefined,
          input["timeout_ms"] as number | undefined
        );

      case "git_clone":
        return this.git.gitClone(input["url"] as string, input["repo_name"] as string);

      case "git_status":
        return this.git.gitStatus(input["repo_path"] as string);

      case "git_diff":
        return this.git.gitDiff(input["repo_path"] as string, input["staged"] as boolean | undefined);

      case "git_commit_push":
        return this.git.gitCommitPush(
          input["repo_path"] as string,
          input["message"] as string,
          input["branch"] as string | undefined
        );

      case "ado_get_work_item":
        return adoGetWorkItem(this.adoClient, input["id"] as number);

      case "ado_add_comment":
        return adoAddComment(this.adoClient, input["id"] as number, input["text"] as string);

      case "ado_update_state":
        return adoUpdateState(this.adoClient, input["id"] as number, input["state"] as string);

      case "ado_list_work_items":
        return adoListWorkItems(this.adoClient, input["wiql"] as string);

      case "web_fetch":
        return webFetch(input["url"] as string, input["headers"] as Record<string, string> | undefined);

      case "task_done":
        return taskDone(input["summary"] as string, input["files_changed"] as string[]);

      case "task_quarantine":
        return taskQuarantine(input["reason"] as string, input["question"] as string);

      default: {
        const exhaustive: never = name;
        return {
          success: false,
          output: "",
          error: `Unknown tool: ${exhaustive}`,
        };
      }
    }
  }
}
