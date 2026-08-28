import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { logHandledError } from "@/lib/logger";
import {
  createCodeWorkspaceZip,
  getCodeWorkspace,
} from "@/modules/code-workspace/storage";

const paramsSchema = z.object({ projectId: z.uuid() });

// Fixed client-facing messages for known code-workspace domain errors.
// The raw error message stays in the server log only.
const FILE_NOT_FOUND_MESSAGES = ["Code workspace not found."];
const FILE_UNAVAILABLE_MESSAGES = ["Invalid code workspace id."];

function arrayBufferFromBytes(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = paramsSchema.safeParse(await params);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const metadata = await getCodeWorkspace(parsed.data.projectId);
      if (metadata.createdByUserId !== session.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        metadata.workspaceId,
        "agents.chat",
      );
      if (forbidden) return forbidden;
      const zip = await createCodeWorkspaceZip({
        projectId: metadata.id,
        workspaceId: metadata.workspaceId,
        userId: session.user.id,
      });
      return new Response(arrayBufferFromBytes(zip.bytes), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${zip.fileName}"`,
          "Cache-Control": "no-store",
        },
      });
    },
    {
      logLabel: "Failed to download code workspace",
      expectedError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        const fixedMessage = FILE_NOT_FOUND_MESSAGES.includes(message)
          ? "File not found"
          : FILE_UNAVAILABLE_MESSAGES.includes(message)
            ? "File unavailable"
            : null;
        if (!fixedMessage) return null;
        logHandledError(
          "Failed to download code workspace",
          { error: message },
          error instanceof Error ? error : undefined,
        );
        return NextResponse.json({ error: fixedMessage }, { status: 404 });
      },
    },
  );
}
