import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Sandbox deliverables are persisted as chat attachments and downloaded
// through the regular attachment route, so they inherit its access control.

const mocks = vi.hoisted(() => ({
  getAttachment: vi.fn(),
  getBytes: vi.fn(),
  canRead: vi.fn(),
}));

vi.mock("@/lib/route-handler", () => ({
  handleRoute: async (
    request: Request,
    handler: (context: {
      session: { user: { id: string } };
      request: Request;
    }) => Promise<Response>,
    options?: { expectedError?: (error: unknown) => Response | null },
  ) => {
    try {
      return await handler({
        session: { user: { id: "11111111-1111-4111-8111-111111111111" } },
        request,
      });
    } catch (error) {
      return (
        options?.expectedError?.(error) ??
        Response.json({ error: "Internal server error" }, { status: 500 })
      );
    }
  },
}));

vi.mock("@/modules/chat/attachments", () => ({
  getChatAttachment: mocks.getAttachment,
  getChatAttachmentBytes: mocks.getBytes,
}));

vi.mock("@/modules/chat/conversation-asset-access", () => ({
  canReadConversationAsset: mocks.canRead,
}));

import { GET } from "@/app/api/workspace/chat-attachments/[attachmentId]/route";

const attachmentId = "22222222-2222-4222-8222-222222222222";
const downloadUrl = `/api/workspace/chat-attachments/${attachmentId}`;
const metadata = {
  kind: "chat_file",
  id: attachmentId,
  workspaceId: "44444444-4444-4444-8444-444444444444",
  createdByUserId: "55555555-5555-4555-8555-555555555555",
  fileName: "report.txt",
  mimeType: "text/plain",
  size: 6,
  url: downloadUrl,
};

function request() {
  return new NextRequest(`http://localhost${downloadUrl}`);
}

const params = { params: Promise.resolve({ attachmentId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAttachment.mockResolvedValue(metadata);
  mocks.getBytes.mockResolvedValue({
    metadata,
    bytes: new TextEncoder().encode("report"),
  });
});

describe("sandbox deliverable download", () => {
  it("serves the persisted file to a user allowed to read the conversation", async () => {
    mocks.canRead.mockResolvedValue(true);

    const response = await GET(request(), params);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      'attachment; filename="report.txt"',
    );
    expect(await response.text()).toBe("report");
    expect(mocks.canRead).toHaveBeenCalledWith(
      metadata,
      "11111111-1111-4111-8111-111111111111",
      "attachment",
    );
  });

  it("hides the file from a user without access and never reads its bytes", async () => {
    mocks.canRead.mockResolvedValue(false);

    const response = await GET(request(), params);

    expect(response.status).toBe(404);
    expect(mocks.getBytes).not.toHaveBeenCalled();
  });
});
