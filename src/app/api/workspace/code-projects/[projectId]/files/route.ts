import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { logHandledError } from "@/lib/logger";
import {
  deleteCodeWorkspaceFile,
  getCodeWorkspace,
  listCodeWorkspaceFiles,
  readCodeWorkspaceFile,
  writeCodeWorkspaceFile,
} from "@/modules/code-workspace/storage";

const paramsSchema = z.object({ projectId: z.uuid() });
const writeFileSchema = z.object({
  path: z.string().trim().min(1).max(260),
  content: z.string().max(1_000_000),
});
const deleteFileSchema = z.object({
  path: z.string().trim().min(1).max(260),
});

// Fixed client-facing messages for known code-workspace domain errors.
// The raw error message stays in the server log only.
const FILE_NOT_FOUND_MESSAGES = [
  "File not found in code workspace.",
  "Code workspace not found.",
];
const FILE_UNAVAILABLE_MESSAGES = [
  "Invalid code workspace id.",
  "Invalid file path.",
  "Absolute paths are not allowed.",
  "Path traversal is not allowed.",
  "File path is too long.",
  "File path is too deep.",
  "Binary files cannot be read as text.",
];
const WRITE_UNAVAILABLE_MESSAGES = [
  "Only supported text web files can be written.",
  "Only supported web files can be imported.",
  "File content is too large.",
  "Code workspace contents are too large. Maximum is 50 MB.",
];
const WRITE_UNAVAILABLE_PREFIXES = ["Too many files. Maximum is "];

function codeWorkspaceFileExpectedError(
  logLabel: string,
  options: {
    status: 400 | 404;
    unavailableMessages?: string[];
    unavailablePrefixes?: string[];
  },
) {
  const unavailableMessages = [
    ...FILE_UNAVAILABLE_MESSAGES,
    ...(options.unavailableMessages ?? []),
  ];
  const unavailablePrefixes = options.unavailablePrefixes ?? [];
  return (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const fixedMessage =
      FILE_NOT_FOUND_MESSAGES.includes(message) ||
      (options.status === 404 && message === "Code workspace not found.")
        ? "File not found"
        : unavailableMessages.includes(message) ||
            unavailablePrefixes.some((prefix) => message.startsWith(prefix))
          ? "File unavailable"
          : null;
    if (!fixedMessage) return null;
    logHandledError(
      logLabel,
      { error: message },
      error instanceof Error ? error : undefined,
    );
    return NextResponse.json(
      { error: fixedMessage },
      { status: options.status },
    );
  };
}

async function authorizeProject(projectId: string, userId: string) {
  const metadata = await getCodeWorkspace(projectId);
  if (metadata.createdByUserId !== userId) {
    return {
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
  const forbidden = await requireWorkspacePermissionAsync(
    userId,
    metadata.workspaceId,
    "agents.chat",
  );
  if (forbidden) {
    return {
      response: forbidden,
    };
  }
  return { metadata };
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
      const auth = await authorizeProject(
        parsed.data.projectId,
        session.user.id,
      );
      if (auth.response) return auth.response;
      const metadata = auth.metadata;
      if (!metadata) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const { searchParams } = req.nextUrl;
      const filePath = searchParams.get("path");
      if (!filePath) {
        return NextResponse.json(
          await listCodeWorkspaceFiles({
            projectId: metadata.id,
            workspaceId: metadata.workspaceId,
            userId: metadata.createdByUserId,
          }),
        );
      }
      return NextResponse.json(
        await readCodeWorkspaceFile({
          projectId: metadata.id,
          workspaceId: metadata.workspaceId,
          userId: metadata.createdByUserId,
          filePath,
        }),
      );
    },
    {
      logLabel: "Failed to read code workspace file",
      expectedError: codeWorkspaceFileExpectedError(
        "Failed to read code workspace file",
        { status: 400 },
      ),
    },
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = writeFileSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const auth = await authorizeProject(
        parsedParams.data.projectId,
        session.user.id,
      );
      if (auth.response) return auth.response;
      const metadata = auth.metadata;
      if (!metadata) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(
        await writeCodeWorkspaceFile({
          projectId: metadata.id,
          workspaceId: metadata.workspaceId,
          userId: metadata.createdByUserId,
          filePath: parsedBody.data.path,
          content: parsedBody.data.content,
        }),
      );
    },
    {
      logLabel: "Failed to write code workspace file",
      expectedError: codeWorkspaceFileExpectedError(
        "Failed to write code workspace file",
        {
          status: 400,
          unavailableMessages: WRITE_UNAVAILABLE_MESSAGES,
          unavailablePrefixes: WRITE_UNAVAILABLE_PREFIXES,
        },
      ),
    },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = deleteFileSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const auth = await authorizeProject(
        parsedParams.data.projectId,
        session.user.id,
      );
      if (auth.response) return auth.response;
      const metadata = auth.metadata;
      if (!metadata) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(
        await deleteCodeWorkspaceFile({
          projectId: metadata.id,
          workspaceId: metadata.workspaceId,
          userId: metadata.createdByUserId,
          filePath: parsedBody.data.path,
        }),
      );
    },
    {
      logLabel: "Failed to delete code workspace file",
      expectedError: codeWorkspaceFileExpectedError(
        "Failed to delete code workspace file",
        { status: 400 },
      ),
    },
  );
}
