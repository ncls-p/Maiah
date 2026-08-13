import { describe, expect, it } from "vitest";

import {
  assistantSelectionNeedsSetup,
  isAssistantSelectionLoading,
} from "@/components/chat/assistant-selection";
import type { AgentVersion, ChatAgent } from "@/components/chat/chat-types";

const configuredAgent: ChatAgent = {
  id: "agent-1",
  name: "Mon Assistant",
  description: null,
  activeVersionId: "version-1",
  modelDisplayName: "qwen3.6-27b",
};

const unconfiguredAgent: ChatAgent = {
  id: "agent-2",
  name: "Draft",
  description: null,
  activeVersionId: null,
};

const readyVersion: AgentVersion = {
  id: "version-1",
  providerId: "provider-1",
  modelId: "model-1",
  isActive: true,
};

const emptyVersion: AgentVersion = {
  id: "version-2",
  providerId: null,
  modelId: null,
  isActive: true,
};

describe("assistant selection loading vs setup", () => {
  it("treats workspace and agent directory hydration as loading", () => {
    expect(
      isAssistantSelectionLoading({
        workspaceLoading: true,
        selectedAgent: null,
        activeVersion: null,
      }),
    ).toBe(true);
    expect(
      isAssistantSelectionLoading({
        agentsLoading: true,
        selectedAgent: configuredAgent,
        activeVersion: null,
      }),
    ).toBe(true);
  });

  it("waits for the active version when the assistant already has one", () => {
    expect(
      isAssistantSelectionLoading({
        selectedAgent: configuredAgent,
        activeVersion: null,
      }),
    ).toBe(true);
    expect(
      isAssistantSelectionLoading({
        selectedAgent: configuredAgent,
        activeVersion: readyVersion,
      }),
    ).toBe(false);
  });

  it("does not show needs-setup copy while selection is still loading", () => {
    expect(
      assistantSelectionNeedsSetup({
        isLoading: true,
        selectedAgent: null,
        activeVersion: null,
      }),
    ).toBe(false);
    expect(
      assistantSelectionNeedsSetup({
        isLoading: true,
        selectedAgent: configuredAgent,
        activeVersion: null,
      }),
    ).toBe(false);
  });

  it("keeps a configured assistant out of the setup state during version fetch", () => {
    expect(
      assistantSelectionNeedsSetup({
        isLoading: false,
        selectedAgent: configuredAgent,
        activeVersion: null,
      }),
    ).toBe(false);
  });

  it("shows needs-setup only when the workspace has no usable assistant", () => {
    expect(
      assistantSelectionNeedsSetup({
        isLoading: false,
        selectedAgent: null,
        activeVersion: null,
      }),
    ).toBe(true);
    expect(
      assistantSelectionNeedsSetup({
        isLoading: false,
        selectedAgent: unconfiguredAgent,
        activeVersion: null,
      }),
    ).toBe(true);
    expect(
      assistantSelectionNeedsSetup({
        isLoading: false,
        selectedAgent: unconfiguredAgent,
        activeVersion: emptyVersion,
      }),
    ).toBe(true);
    expect(
      assistantSelectionNeedsSetup({
        isLoading: false,
        selectedAgent: configuredAgent,
        activeVersion: readyVersion,
      }),
    ).toBe(false);
  });
});
