import { createHash } from "node:crypto";



import { previewOrganizationTransfer } from "./organization-transfer.preview-organization-transfer";


export async function previewOrganizationClone(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetOrganizationId: string;
  secretPolicy: "keep" | "disable";
}) {
  const transferPreview = await previewOrganizationTransfer(input);
  const preview = {
    ...transferPreview,
    conflictResolutions: [],
    blockers: [] as string[],
    warnings: [
      "Each source project will be created as a new project in the destination organization.",
      "Teams, members, custom roles, permissions, and organization tool policies will be copied. The source organization stays unchanged.",
      "Chats, execution history, audit logs, API keys, and pending requests stay in the source organization.",
      input.secretPolicy === "keep"
        ? "Encrypted provider, MCP, and connection secrets will be copied."
        : "Cloned providers, MCP servers, tools, and connections will be disabled until their secrets are configured.",
      "Project and team URLs receive a short suffix so cloning never overwrites existing content.",
    ],
  };
  return {
    ...preview,
    confirmationToken: createHash("sha256")
      .update(
        JSON.stringify({
          mode: "clone",
          sourceOrganizationId: preview.source.organizationId,
          targetOrganizationId: preview.destination.organizationId,
          counts: preview.counts,
          secretPolicy: input.secretPolicy,
        }),
      )
      .digest("hex"),
  };
}
