import { z } from "zod";
import type { BuiltInToolSummary } from "@/modules/tool/builtin-tools-catalog.tool-risk-level";

// Fixed regional hosts prevent a saved connection from becoming an SSRF proxy.
export const GENESYS_REGIONS = [
  "mypurecloud.ie",
  "mypurecloud.de",
  "mypurecloud.com",
  "usw2.pure.cloud",
  "cac1.pure.cloud",
  "mypurecloud.com.au",
  "mypurecloud.jp",
  "apne2.pure.cloud",
  "aps1.pure.cloud",
  "euw2.pure.cloud",
  "sae1.pure.cloud",
  "mec1.pure.cloud",
  "apse1.pure.cloud",
  "aps2.pure.cloud",
] as const;
export const connectionInput = z.object({
  label: z.string().trim().min(1).max(120),
  region: z.enum(GENESYS_REGIONS),
  integrationId: z.uuid(),
  clientId: z.uuid(),
  clientSecret: z.string().min(1).max(4096).optional(),
  webhookSecret: z.string().min(32).max(4096).optional(),
  projectIds: z.array(z.uuid()).max(100),
  enabled: z.boolean(),
});
export type ConnectionInput = z.infer<typeof connectionInput>;
export const handoffInput = z.object({
  reason: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(1).max(3000),
});
export const HANDOFF_TOOL = {
  id: "00000000-0000-4000-8000-000000000201",
  name: "request_human_handoff",
  displayName: "Human support · Genesys",
  description:
    "Transfer this conversation to human support. Share a concise reason and useful summary. After acceptance stop answering; the human consultant takes over. Requires a configured Genesys connection for the project. Interactive assistant chat only.",
  riskLevel: "medium",
  category: "support",
} satisfies BuiltInToolSummary;
export const activeStates = [
  "requested",
  "waiting",
  "human",
  "closing",
  "uncertain",
  "failed",
  "completed",
] as const;
export type HandoffState = (typeof activeStates)[number] | "resumed";
export class GenesysError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
export type HandoffView = {
  id: string;
  state: HandoffState;
  errorCode: string | null;
  updatedAt: string;
  deliveryPending: number;
  deliveryFailed: number;
};
export type GenesysChatState = {
  available: boolean;
  session: HandoffView | null;
};
