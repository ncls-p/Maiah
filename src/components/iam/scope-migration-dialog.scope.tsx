"use client";



export type Scope = "project" | "organization";
export type Mode = "move" | "clone";
export type Destination = {
  workspaceId: string;
  workspaceName: string;
  organizationId: string;
  organizationName: string;
};
export type Preview = {
  source: {
    workspaceName?: string;
    organizationName: string;
  };
  destination: Destination;
  items?: { id: string }[];
  members?: { moved: number };
  counts?: Record<string, number>;
  conflictResolutions?: Array<{
    resourceType: "project" | "team" | "role";
    resourceId: string;
    label: string;
    from: string;
    to: string;
  }>;
  blockers?: string[];
  warnings: string[];
  confirmationToken: string;
};

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as T;
}
