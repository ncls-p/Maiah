import {
  decideToolApproval,
  type AiHubToolApprovalPolicy,
} from "@/modules/tool/approval-policy";
import { evaluateOpaToolApprovalPolicy } from "@/modules/tool/opa-approval-policy";
import type { BoundToolApprovalMetadata } from "./route-support.chat-request-schema";

type ApprovalContext = {
  workspaceId: string;
  conversationId?: string;
  messageId?: string;
  userId: string;
  agentVersionId: string;
  approvalPolicy?: AiHubToolApprovalPolicy | null;
};

export function createBoundToolApproval(
  input: ApprovalContext,
  metadataByTool: ReadonlyMap<string, BoundToolApprovalMetadata>,
) {
  return async ({
    toolCall,
  }: {
    toolCall: { toolName: string; input: unknown };
  }) => {
    const metadata = metadataByTool.get(toolCall.toolName);
    if (!metadata) return undefined;
    const decision =
      (await evaluateOpaToolApprovalPolicy({
        toolName: metadata.toolName,
        toolSource: metadata.toolSource,
        riskLevel: metadata.riskLevel,
        toolInput: toolCall.input,
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        userId: input.userId,
        agentVersionId: input.agentVersionId,
      })) ??
      decideToolApproval({
        policy: input.approvalPolicy,
        ...metadata,
      });
    // Human approvals stay in the existing DB-audited streaming flow. Native
    // approval is reserved for hard policy denials before execution starts.
    return decision.status === "deny" ? decision.aiSdkStatus : undefined;
  };
}
