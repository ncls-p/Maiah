"use client";

import {
type LucideIcon
} from "lucide-react";

import {
type ChatCapabilityOverrides,
type ChatToolSource
} from "@/components/chat/chat-capability-overrides";

export type EnabledToolSummary = {
  id: string;
  source: ChatToolSource;
  name: string;
  description: string | null;
  group: string | null;
  requireApproval: boolean;
};

export type EnabledSkillSummary = {
  id: string;
  name: string;
  description: string | null;
};

export type EnabledToolsPayload = {
  tools: EnabledToolSummary[];
  skills: EnabledSkillSummary[];
};

export type Capability = {
  key: string;
  id: string;
  source: ChatToolSource | "skill";
  category: "tools" | "skills" | "mcp";
  name: string;
  description: string;
};

export type CapabilityGroup = {
  category: Capability["category"];
  icon: LucideIcon;
  capabilities: Capability[];
};

export function toolKey(source: ChatToolSource, id: string) {
  return `${source}:${id}`;
}

export function isCapabilityActive(
  capability: Capability,
  overrides: ChatCapabilityOverrides,
) {
  if (capability.source === "skill") {
    return !overrides.disabledSkillIds.includes(capability.id);
  }
  return !overrides.disabledTools.some(
    (tool) => tool.source === capability.source && tool.id === capability.id,
  );
}
