import { NextRequest } from "next/server";

import { handleOpenAIProxyRoute } from "@/modules/openai-proxy/auth";
import { resolveOpenAIProxyModel } from "@/modules/openai-proxy/model-catalog";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ model: string[] }> },
) {
  return handleOpenAIProxyRoute(request, "models.view", async (context) => {
    const requestedModel = (await params).model.join("/");
    const model = await resolveOpenAIProxyModel(
      context.workspaceId,
      requestedModel,
    );
    return Response.json(model.publicModel);
  });
}
