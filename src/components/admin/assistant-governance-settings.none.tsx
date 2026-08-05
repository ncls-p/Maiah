"use client";



export const NONE = "__none__";

export type Agent = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl?: string | null;
  activeVersionId: string | null;
  modelDisplayName?: string | null;
  organizationDisplayOrder?: number;
  isOrganizationDefault?: boolean;
  isGlobal: boolean;
  isRecommended: boolean;
  canEdit?: boolean;
};

export function isOrganizationAgent(agent: Agent) {
  return agent.isGlobal || agent.isRecommended;
}
