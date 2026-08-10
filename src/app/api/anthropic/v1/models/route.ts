import { NextRequest } from "next/server";

import { handleAnthropicProxyRoute } from "@/modules/anthropic-proxy/auth";
import { listAnthropicProxyModels } from "@/modules/anthropic-proxy/model-catalog";

export async function GET(request: NextRequest) {
  return handleAnthropicProxyRoute(request, "models.view", async (context) =>
    Response.json(await listAnthropicProxyModels(context.workspaceId)),
  );
}
