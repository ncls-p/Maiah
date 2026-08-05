import type { TextStreamPart,ToolSet } from "ai";
import { describe,expect,it,vi } from "vitest";

import { createAnthropicMessagesStream } from "@/modules/anthropic-proxy/streams";
import {
anthropicRequest,
anthropicStreamParts,
} from "./anthropic-proxy-fixtures";

function errorStream(parts: Array<TextStreamPart<ToolSet>>) {
  return createAnthropicMessagesStream({
    request: anthropicRequest({ stream: true }),
    requestId: "req_error",
    result: { stream: anthropicStreamParts(parts) },
    callbacks: { onComplete: vi.fn(), onError: vi.fn() },
  });
}

describe("Anthropic stream failures", () => {
  it("emits an error when the upstream ends without a finish event", async () => {
    const body = await errorStream([]).text();
    expect(body).toContain("event: error");
    expect(body).toContain('"type":"api_error"');
  });

  it("maps aborted streams to an Anthropic error event", async () => {
    const body = await errorStream([
      {
        type: "abort",
        reason: "cancelled by caller",
      } as TextStreamPart<ToolSet>,
    ]).text();
    expect(body).toContain("event: error");
    expect(body).toContain("cancelled by caller");
  });
});
