import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { createChatAttachment } from "@/modules/chat/attachments";
import {
  assembleDocumentUpload,
  parseChunkMetadata,
  parseCompletionMetadata,
  storeDocumentUploadChunk,
} from "@/modules/document-upload/server";

const uploadSchema = z.object({
  workspaceId: z.uuid(),
});

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const phase = req.nextUrl.searchParams.get("phase");
      if (phase === "complete") {
        const payload = parseCompletionMetadata(
          await req.json().catch(() => null),
        );
        if (!payload) {
          return NextResponse.json(
            { error: "Invalid upload completion" },
            { status: 400 },
          );
        }
        const forbidden = await requireWorkspacePermissionAsync(
          session.user.id,
          payload.workspaceId,
          "agents.chat",
        );
        if (forbidden) return forbidden;
        const assembled = await assembleDocumentUpload({
          workspaceId: payload.workspaceId,
          userId: session.user.id,
          uploadId: payload.uploadId,
          totalChunks: payload.totalChunks,
        });
        let completed = false;
        try {
          const attachment = await createChatAttachment({
            workspaceId: payload.workspaceId,
            userId: session.user.id,
            fileName: payload.fileName,
            mimeType: payload.mimeType,
            bytes: await assembled.readBytes(),
          });
          completed = true;
          return NextResponse.json({ attachment });
        } finally {
          await assembled.cleanup(completed);
        }
      }

      const formData = await req.formData();
      if (phase === "chunk") {
        const chunk = parseChunkMetadata(formData);
        if (!chunk) {
          return NextResponse.json(
            { error: "Invalid document chunk" },
            { status: 400 },
          );
        }
        const forbidden = await requireWorkspacePermissionAsync(
          session.user.id,
          chunk.workspaceId,
          "agents.chat",
        );
        if (forbidden) return forbidden;
        await storeDocumentUploadChunk({
          workspaceId: chunk.workspaceId,
          userId: session.user.id,
          uploadId: chunk.uploadId,
          chunkIndex: chunk.chunkIndex,
          bytes: new Uint8Array(await chunk.chunk.arrayBuffer()),
        });
        return NextResponse.json(
          { uploadId: chunk.uploadId, chunkIndex: chunk.chunkIndex },
          { status: 202 },
        );
      }
      const parsed = uploadSchema.safeParse({
        workspaceId: formData.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "agents.chat",
      );
      if (forbidden) return forbidden;

      const uploadedFile = formData.get("file");
      if (!(uploadedFile instanceof File)) {
        return NextResponse.json(
          { error: "Attachment file is required" },
          { status: 400 },
        );
      }
      const attachment = await createChatAttachment({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        fileName: uploadedFile.name,
        mimeType: uploadedFile.type,
        bytes: new Uint8Array(await uploadedFile.arrayBuffer()),
      });

      return NextResponse.json({ attachment });
    },
    {
      logLabel: "Failed to upload chat attachment",
      expectedError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/image|file|too large|unsupported|attachment|read/i.test(message)) {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}
