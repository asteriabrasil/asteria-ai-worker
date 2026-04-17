import type { Config, AdoWorkItem, AdoComment, AdoRelation, WiqlResult } from "../types.js";
import { AdoApiError } from "../utils/errors.js";

type AdoConfig = Config["ado"];

export class AdoClient {
  private readonly authHeader: string;
  private readonly baseUrl: string;

  constructor(private readonly config: AdoConfig) {
    const token = Buffer.from(`:${config.pat}`).toString("base64");
    this.authHeader = `Basic ${token}`;
    this.baseUrl = `https://dev.azure.com/${config.org}`;
  }

  async runWiql(query: string): Promise<WiqlResult> {
    const url = `${this.baseUrl}/_apis/wit/wiql?api-version=7.2-preview.2`;
    const response = await this.apiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = (await response.json()) as { workItems?: Array<{ id: number; url: string }> };
    return { workItems: data.workItems ?? [] };
  }

  async getWorkItem(id: number): Promise<AdoWorkItem> {
    const url = `${this.baseUrl}/_apis/wit/workItems/${id}?$expand=relations&api-version=7.2-preview.1`;
    const response = await this.apiFetch(url);
    const data = (await response.json()) as {
      id: number;
      fields: Record<string, unknown>;
      relations?: Array<{ rel: string; url: string; attributes: Record<string, unknown> }>;
    };

    const fields = data.fields;

    const assignedToRaw = fields["System.AssignedTo"];
    let assignedTo: string | null = null;
    if (assignedToRaw && typeof assignedToRaw === "object") {
      assignedTo = (assignedToRaw as { displayName?: string }).displayName ?? null;
    } else if (typeof assignedToRaw === "string") {
      assignedTo = assignedToRaw;
    }

    const relations: AdoRelation[] = (data.relations ?? []).map((r) => ({
      rel: r.rel,
      url: r.url,
      attributes: r.attributes ?? {},
    }));

    return {
      id: data.id,
      type: String(fields["System.WorkItemType"] ?? ""),
      title: String(fields["System.Title"] ?? ""),
      description: fields["System.Description"] != null ? String(fields["System.Description"]) : null,
      state: String(fields["System.State"] ?? ""),
      assignedTo,
      tags: fields["System.Tags"] != null ? String(fields["System.Tags"]) : null,
      parentId: fields["System.Parent"] != null ? Number(fields["System.Parent"]) : null,
      acceptanceCriteria:
        fields["Microsoft.VSTS.Common.AcceptanceCriteria"] != null
          ? String(fields["Microsoft.VSTS.Common.AcceptanceCriteria"])
          : null,
      iterationPath: fields["System.IterationPath"] != null ? String(fields["System.IterationPath"]) : null,
      areaPath: fields["System.AreaPath"] != null ? String(fields["System.AreaPath"]) : null,
      repositoryUrl:
        fields["Custom.RepositoryUrl"] != null ? String(fields["Custom.RepositoryUrl"]) : null,
      comments: [],
      relations,
    };
  }

  async updateState(id: number, newState: string): Promise<void> {
    const url = `${this.baseUrl}/_apis/wit/workItems/${id}?api-version=7.2-preview.1`;
    await this.apiFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json-patch+json" },
      body: JSON.stringify([{ op: "replace", path: "/fields/System.State", value: newState }]),
    });
  }

  async addComment(id: number, text: string): Promise<void> {
    // Para Cross-Project, é necessário incluir o projectName. Como não temos mais na config global,
    // podemos extrair o TeamProject do workItem antes de comentar.
    const wi = await this.getWorkItem(id);
    const projectName = (wi as any).fields?.["System.TeamProject"] || wi.areaPath?.split('\\')[0] || "Unknown";
    const url = `${this.baseUrl}/${encodeURIComponent(projectName)}/_apis/wit/workItems/${id}/comments?format=0&api-version=7.2-preview.4`;
    
    await this.apiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }

  async getComments(id: number): Promise<AdoComment[]> {
    const wi = await this.getWorkItem(id);
    const projectName = (wi as any).fields?.["System.TeamProject"] || wi.areaPath?.split('\\')[0] || "Unknown";
    const url = `${this.baseUrl}/${encodeURIComponent(projectName)}/_apis/wit/workItems/${id}/comments?api-version=7.2-preview.4`;
    
    const response = await this.apiFetch(url);
    const data = (await response.json()) as {
      comments?: Array<{
        id: number;
        text: string;
        createdBy?: { displayName?: string };
        createdDate?: string;
      }>;
    };

    return (data.comments ?? []).map((c) => ({
      id: c.id,
      text: c.text ?? "",
      createdBy: c.createdBy?.displayName ?? "unknown",
      createdDate: c.createdDate ?? "",
    }));
  }

  private async apiFetch(url: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    };

    const response = await fetch(url, { ...init, headers });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AdoApiError(
        `ADO API request failed: ${response.status} ${response.statusText} — ${url}`,
        response.status,
        body
      );
    }

    return response;
  }
}
