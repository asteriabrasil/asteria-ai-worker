export function AI_WORKER_WIQL(assignedTo: string): string {
  return `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
FROM WorkItems
WHERE [System.WorkItemType] = 'Task'
  AND [System.AssignedTo] = '${assignedTo}'
  AND [System.Tags] CONTAINS 'ai-worker'
  AND [System.State] IN ('To Do', 'In Progress')
  AND [Microsoft.VSTS.Scheduling.StartDate] <= @Today
  AND [Microsoft.VSTS.Scheduling.FinishDate] IS EMPTY
ORDER BY [System.State] ASC, [System.Id] ASC`;
}

export function SIBLING_TASKS_WIQL(pbiId: number): string {
  return `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
FROM WorkItemLinks
WHERE (
  [Source].[System.Id] = ${pbiId}
  AND [Source].[System.WorkItemType] = 'Product Backlog Item'
)
AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward'
AND (
  [Target].[System.WorkItemType] = 'Task'
  AND [Target].[System.Tags] CONTAINS 'ai-worker'
)
MODE (MustContain)`;
}

export const WORK_ITEM_FIELDS: string[] = [
  "System.Id",
  "System.WorkItemType",
  "System.Title",
  "System.Description",
  "System.State",
  "System.AssignedTo",
  "System.Tags",
  "System.Parent",
  "Microsoft.VSTS.Common.AcceptanceCriteria",
  "System.IterationPath",
  "System.AreaPath",
  "Custom.RepositoryUrl",
];
