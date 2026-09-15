import { describe, expect, it, vi } from "vitest";
const requestHandoff = vi.hoisted(() =>
  vi.fn(async () => ({ accepted: true, handoffId: "session" })),
);
vi.mock("@/modules/genesys/sessions", () => ({
  requestHandoff,
  currentHandoff: async () => ({ id: "handoff" }),
}));
import { genesysHandoffTool } from "@/modules/genesys/tool";
describe("human handoff tool entry point", () => {
  const context = {
    workspaceId: "workspace",
    userId: "actor",
    conversationId: "conversation",
    messageId: "message",
    emitEvent: () => {},
  };
  it("rejects background, child and context-free calls", async () => {
    await expect(genesysHandoffTool.execute({})).rejects.toMatchObject({
      code: "GENESYS_INTERACTIVE_ONLY",
    });
    await expect(genesysHandoffTool.execute({}, context)).rejects.toMatchObject(
      { code: "GENESYS_INTERACTIVE_ONLY" },
    );
    await expect(
      genesysHandoffTool.execute(
        {},
        { ...context, interactiveChat: true, messageId: undefined },
      ),
    ).rejects.toMatchObject({ code: "GENESYS_INTERACTIVE_ONLY" });
  });
  it("propagates only server-resolved identity and conversation context", async () => {
    const input = { reason: "help", summary: "context" };
    await expect(
      genesysHandoffTool.execute(input, { ...context, interactiveChat: true }),
    ).resolves.toEqual({ accepted: true, handoffId: "session" });
    expect(requestHandoff).toHaveBeenCalledWith(
      "actor",
      "conversation",
      input,
      "message",
    );
  });
});

import { decideToolApproval } from "@/modules/tool/approval-policy";
import { evaluateOpaToolApprovalPolicy } from "@/modules/tool/opa-approval-policy";
import { afterEach } from "vitest";
describe("handoff uses the shared approval policy", () => {
  const tool = {
    toolName: "request_human_handoff",
    toolSource: "builtin" as const,
    riskLevel: "medium",
  };
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("honors default denial and forced approval even for medium-risk support", () => {
    expect(
      decideToolApproval({ ...tool, policy: { defaultDecision: "deny" } })
        .status,
    ).toBe("deny");
    expect(
      decideToolApproval({
        ...tool,
        policy: { requireApprovalForAllTools: true },
      }).status,
    ).toBe("requires_approval");
    expect(
      decideToolApproval({ ...tool, bindingRequiresApproval: true }).status,
    ).toBe("requires_approval");
    expect(
      decideToolApproval({
        ...tool,
        policy: { requireApprovalToolNames: [tool.toolName] },
      }).status,
    ).toBe("requires_approval");
    expect(
      decideToolApproval({
        ...tool,
        policy: { defaultDecision: "require_approval" },
      }).status,
    ).toBe("requires_approval");
  });
  it.each([
    { decision: "allow" },
    { decision: "deny" },
    { decision: "requires-approval" },
    undefined,
  ])("honors external policy decision %j", async (result) => {
    vi.stubEnv("AI_HUB_TOOL_POLICY_OPA_URL", "https://opa.example/");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ result })),
    );
    const decision = await evaluateOpaToolApprovalPolicy({
      ...tool,
      toolInput: { reason: "help" },
      workspaceId: "workspace",
      userId: "user",
    });
    expect(decision?.status ?? null).toBe(
      result?.decision === "allow"
        ? "allow"
        : result?.decision === "deny"
          ? "deny"
          : result === undefined
            ? null
            : "requires_approval",
    );
  });
  it("fails closed on policy-service errors when configured", async () => {
    vi.stubEnv("AI_HUB_TOOL_POLICY_OPA_URL", "https://opa.example");
    vi.stubEnv("AI_HUB_TOOL_POLICY_OPA_FAIL_CLOSED", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    expect(
      (
        await evaluateOpaToolApprovalPolicy({
          ...tool,
          toolInput: {},
          workspaceId: "workspace",
          userId: "user",
        })
      )?.status,
    ).toBe("deny");
  });
});

import { shouldStopForHandoff } from "@/modules/genesys/chat-stop";
it("stops from durable handoff state even when the tool result could not be logged", async () => {
  expect(
    await shouldStopForHandoff("conversation", ["request_human_handoff"]),
  ).toBe(true);
  expect(await shouldStopForHandoff("conversation", ["calculator"])).toBe(
    false,
  );
});
