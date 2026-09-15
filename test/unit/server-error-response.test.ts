import { expect, it } from "vitest";
import { serverErrorResponse } from "@/lib/server-error-response";
it("exposes the actionable Bedrock failure and a correlated reference in production", () => {
  expect(
    serverErrorResponse(new Error("BEDROCK_REGION_REQUIRED"), "request-123"),
  ).toMatchObject({
    error: "BEDROCK_REGION_REQUIRED\nReference: request-123",
    code: "BEDROCK_REGION_REQUIRED",
    requestId: "request-123",
  });
});
it("redacts credentials and URL queries without serializing stack, cause or provider request bodies", () => {
  const error = Object.assign(
    new Error(
      "Failed at https://user:pass@example.com/api?token=secret Bearer abc apiKey=private",
    ),
    {
      requestBodyValues: { prompt: "private prompt" },
      cause: new Error("secret cause"),
    },
  );
  const output = JSON.stringify(serverErrorResponse(error, "request-123"));
  for (const secret of [
    "user:pass",
    "token=secret",
    "Bearer abc",
    "private",
    "secret cause",
    "stack",
  ])
    expect(output).not.toContain(secret);
});
it("does not send SQL or bound parameters to the browser", () => {
  const output = serverErrorResponse(
    new Error(
      "Failed query: select * from user where email = $1 params: private@example.com",
    ),
    "reference",
  );
  expect(output.code).toBe("DATABASE_ERROR");
  expect(output.error).not.toContain("private@example.com");
});

it("keeps persisted error parts in the chat rendering pipeline", async () => {
  const { renderablePartsFromMessage } =
    await import("@/components/chat/chat-types.chat-stream-event");
  const part = {
    type: "error",
    content: "BEDROCK_REGION_REQUIRED\nReference: request-123",
  };
  expect(
    renderablePartsFromMessage({
      id: "message",
      role: "assistant",
      status: "failed",
      parts: [part],
    } as never),
  ).toEqual([part]);
});
