import { NextRequest } from "next/server";

import { handleAnthropicProxyRoute } from "@/modules/anthropic-proxy/auth";
import { retrieveAnthropicProxyModel } from "@/modules/anthropic-proxy/model-catalog";

export async function GET(request: NextRequest, { params }: { params: Promise<{ model: string[] }> }) {
  return handleAnthropicProxyRoute(request, "models.view", async (context) => {
    const modelId = (await params).model.join("/");
    return Response.json(await retrieveAnthropicProxyModel(context.workspaceId, modelId));
  });
}
