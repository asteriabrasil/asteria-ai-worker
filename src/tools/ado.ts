import type { AdoClient } from "../ado/client.js";
import type { ToolResult } from "../types.js";

export async function adoGetWorkItem(client: AdoClient, id: number): Promise<ToolResult> {
  try {
    const workItem = await client.getWorkItem(id);
    return {
      success: true,
      output: JSON.stringify(workItem, null, 2),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Failed to get work item: ${message}` };
  }
}

export async function adoAddComment(
  client: AdoClient,
  id: number,
  text: string
): Promise<ToolResult> {
  try {
    await client.addComment(id, text);
    return { success: true, output: `Comment added to work item #${id}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Failed to add comment: ${message}` };
  }
}

export async function adoUpdateState(
  client: AdoClient,
  id: number,
  state: string
): Promise<ToolResult> {
  try {
    await client.updateState(id, state);
    return { success: true, output: `Work item #${id} state updated to "${state}"` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Failed to update state: ${message}` };
  }
}

export async function adoListWorkItems(client: AdoClient, wiql: string): Promise<ToolResult> {
  try {
    const result = await client.runWiql(wiql);
    if (result.workItems.length === 0) {
      return { success: true, output: "[]" };
    }

    const items = await Promise.all(result.workItems.map((wi) => client.getWorkItem(wi.id)));
    return {
      success: true,
      output: JSON.stringify(items, null, 2),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Failed to list work items: ${message}` };
  }
}
