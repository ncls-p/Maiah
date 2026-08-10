"use client";

import { type LucideIcon } from "lucide-react";

import {
  type ChatCapabilityOverrides,
  type ChatToolSource,
} from "@/components/chat/chat-capability-overrides";

export type EnabledToolSummary = {
  id: string;
  source: ChatToolSource;
  name: string;
  description: string | null;
  group: string | null;
  requireApproval: boolean;
  attached?: boolean;
};

export type EnabledSkillSummary = {
  id: string;
  name: string;
  description: string | null;
  attached?: boolean;
};

export type EnabledKnowledgeSummary = {
  id: string;
  name: string;
  description: string | null;
  attached?: boolean;
};

export type EnabledToolsPayload = {
  tools: EnabledToolSummary[];
  skills: EnabledSkillSummary[];
  knowledge?: EnabledKnowledgeSummary[];
};

export type Capability = {
  key: string;
  id: string;
  source: ChatToolSource | "skill" | "knowledge";
  category: "tools" | "skills" | "mcp" | "knowledge";
  name: string;
  description: string;
  attached: boolean;
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
  if (capability.source === "knowledge")
    return (
      capability.attached ||
      overrides.enabledKnowledgeIds.includes(capability.id)
    );
  if (capability.source === "skill") {
    return capability.attached
      ? !overrides.disabledSkillIds.includes(capability.id)
      : overrides.enabledSkillIds.includes(capability.id);
  }
  return capability.attached
    ? !overrides.disabledTools.some(
        (tool) =>
          tool.source === capability.source && tool.id === capability.id,
      )
    : overrides.enabledTools.some(
        (tool) =>
          tool.source === capability.source && tool.id === capability.id,
      );
}
