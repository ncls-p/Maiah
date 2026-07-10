import { describe, expect, it } from "vitest";

import { mergeAgentEditorState } from "@/app/[locale]/(workspace)/agents/[agentId]/agent-editor-state";
import type { Agent } from "@/app/[locale]/(workspace)/agents/[agentId]/types";

const currentAgent: Agent = {
  id: "agent-1",
  kind: "assistant",
  name: "Before",
  slug: "before",
  description: null,
  activeVersionId: "version-1",
  sharingMode: "specific_user",
  shareTargetEmail: "person@example.com",
  isGlobal: false,
  isRecommended: false,
  curationLabel: null,
  canAdminCurate: true,
  canEdit: true,
  canClone: true,
};

describe("mergeAgentEditorState", () => {
  it("keeps editor permissions and resolved sharing data after a mutation", () => {
    const persisted: Agent = {
      ...currentAgent,
      name: "After",
      activeVersionId: "version-2",
      shareTargetEmail: undefined,
      canAdminCurate: false,
      canEdit: undefined,
      canClone: undefined,
    };

    expect(mergeAgentEditorState(currentAgent, persisted)).toMatchObject({
      name: "After",
      activeVersionId: "version-2",
      shareTargetEmail: "person@example.com",
      canAdminCurate: true,
      canEdit: true,
      canClone: true,
    });
  });

  it("uses an explicitly resolved share target from the submitted form", () => {
    expect(
      mergeAgentEditorState(currentAgent, currentAgent, {
        shareTargetEmail: "new-person@example.com",
      }).shareTargetEmail,
    ).toBe("new-person@example.com");
  });

  it("clears the resolved share target when sharing no longer targets a user", () => {
    expect(
      mergeAgentEditorState(currentAgent, currentAgent, {
        shareTargetEmail: null,
      }).shareTargetEmail,
    ).toBeNull();
  });
});
