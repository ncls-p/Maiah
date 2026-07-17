import { NextRequest } from "next/server";

import { handleOpenAIProxyRoute } from "@/modules/openai-proxy/auth";
import { listOpenAIProxyModels } from "@/modules/openai-proxy/model-catalog";

export async function GET(request: NextRequest) {
  return handleOpenAIProxyRoute(request, "models.view", async (context) => {
    const models = await listOpenAIProxyModels(context.workspaceId);
    return Response.json({ object: "list", data: models });
  });
}
