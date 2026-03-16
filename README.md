# asteria-ai-worker

An autonomous Azure DevOps Task executor powered by Claude's tool-use API. The agent picks up Tasks tagged `ai-worker` from your ADO board, reads the associated PBI for context, clones the repository, implements the required changes, commits and pushes, then marks the task as Done — all without human intervention.

## What it does

1. Queries ADO for Tasks assigned to a configured user with the `ai-worker` tag and state `To Do` or `In Progress`.
2. Prioritizes an `In Progress` task (resume) over a `To Do` task (new work).
3. Fetches the parent PBI for full context (description, acceptance criteria).
4. Transitions the Task to `In Progress` and, if needed, the PBI as well.
5. Starts a Claude agentic loop that can: read/write files, run bash commands, operate git, call ADO APIs, and fetch URLs.
6. Claude posts an execution plan as a comment, implements the task, then signals completion via `task_done`.
7. On completion: posts an evidence comment and marks the Task `Done`. If all sibling tasks are done, moves the PBI to `Test` and mentions `@Pedro Nunes`.
8. If blocked: calls `task_quarantine`, posts a comment with `@Pedro Nunes` and marks the Task `Quarantine`.
9. If the token limit is reached mid-task: saves a progress snapshot as an ADO comment and leaves the task `In Progress` for the next run.

## State machine

```
[To Do]
   │
   ▼ (agent picks up task)
[In Progress]
   │
   ├──(task_done)──────────────► [Done]
   │                                │
   │                         (all siblings Done?)
   │                                │ yes
   │                                ▼
   │                          PBI → [Test]
   │
   ├──(task_quarantine)──────► [Quarantine]
   │                           (@ mention human)
   │
   ├──(token limit)──────────► stays [In Progress]
   │                           (snapshot saved, resumes next run)
   │
   └──(unhandled error)──────► [Quarantine]
```

## Setup

### 1. Clone and install

```bash
git clone <this-repo-url>
cd asteria-ai-worker
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `ADO_ORG` | Yes | Azure DevOps organization name |
| `ADO_PAT` | Yes | Personal Access Token with Work Items read/write |
| `ADO_ASSIGNED_TO` | Yes | Email of the user tasks are assigned to |
| `ADO_PROJECT` | Yes | ADO project name |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `CLAUDE_MODEL` | No | Model ID (default: `claude-sonnet-4-6`) |
| `WORKSPACE_DIR` | Yes | Local directory for cloning repositories |
| `TOKEN_LIMIT_THRESHOLD` | No | Total token budget per run (default: `150000`) |
| `ANTHROPIC_MAX_TOKENS` | No | Max tokens per API call (default: `8192`) |
| `BASH_PATH` | No | Path to bash.exe (default: `C:/Program Files/Git/bin/bash.exe`) |

### 3. ADO prerequisites

- Tasks must be tagged `ai-worker`
- Tasks must be assigned to `ADO_ASSIGNED_TO`
- Tasks must have a parent PBI
- The repository URL must be in the `Custom.RepositoryUrl` field or mentioned as a full URL (`https://bitbucket.org/...` or `https://github.com/...`) in the task or PBI description
- Create a custom field `Custom.RepositoryUrl` (Text) in your ADO process template, or include the URL in the description

### 4. Build and run

```bash
# Build TypeScript
npm run build

# Run once
npm start

# Run in dev mode (with ts-node)
npm run dev

# Type-check only
npm run typecheck
```

## Architecture

```
src/
  index.ts                    ← CLI entry point
  config.ts                   ← loads .env via zod
  types.ts                    ← all shared TypeScript interfaces
  ado/
    client.ts                 ← ADO REST API client
    queries.ts                ← WIQL queries
  agent/
    loop.ts                   ← Anthropic agentic loop (core)
    tool-registry.ts          ← dispatches tool calls
    tools.ts                  ← Claude tool definitions (schemas)
    system-prompt.ts          ← builds system prompt
  tools/
    fs.ts                     ← read_file, write_file, list_directory, search_files
    shell.ts                  ← run_bash (Git Bash / MINGW64)
    git.ts                    ← git_clone, git_status, git_diff, git_commit_push
    ado.ts                    ← ado_get_work_item, ado_add_comment, ado_update_state
    web.ts                    ← web_fetch
    control.ts                ← task_done, task_quarantine (signal objects)
  runner/
    scheduler.ts              ← main run() function
    state-machine.ts          ← handleOutcome, checkAllSiblingsDone
    progress.ts               ← token tracking, snapshot save/load
  utils/
    logger.ts                 ← simple console logger
    markdown.ts               ← ADO comment builders
    errors.ts                 ← typed error classes
```

## Scheduling

The worker is designed to be run as a scheduled task. On Windows, add a Task Scheduler entry:

```
Program: node
Arguments: C:\path\to\asteria-ai-worker\dist\index.js
Schedule: Every 15 minutes (or as needed)
```

Or use a cron job on a Linux/WSL runner:

```cron
*/15 * * * * cd /path/to/asteria-ai-worker && node dist/index.js >> /var/log/ai-worker.log 2>&1
```
