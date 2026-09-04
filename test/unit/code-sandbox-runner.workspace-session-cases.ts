import { readdirSync } from "node:fs";

import { expect, it } from "vitest";

type Response = {
  status: number | undefined;
  body: {
    ok?: boolean;
    stdout?: string;
    sessionId?: string;
    files?: Array<{ path: string; modified?: boolean; deleted?: boolean }>;
  };
};

export function registerWorkspaceSessionCases(input: {
  requestRun: (payload: unknown) => Promise<Response>;
  requestRunner: (
    path: string,
    payload?: unknown,
    method?: string,
  ) => Promise<Response>;
  runRoot: () => string;
}) {
  it("preserves package metadata and reports deleted workspace files", async () => {
    const result = await input.requestRun({
      language: "bash",
      code: "grep -o workspace-app package.json\nrm obsolete.txt",
      files: [
        { path: "package.json", content: '{"name":"workspace-app"}\n' },
        { path: "obsolete.txt", content: "remove me" },
      ],
    });

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.stdout?.trim()).toBe("workspace-app");
    expect(result.body.files).toContainEqual(
      expect.objectContaining({ path: "package.json", modified: false }),
    );
    expect(result.body.files).toContainEqual(
      expect.objectContaining({
        path: "obsolete.txt",
        modified: true,
        deleted: true,
      }),
    );
  });

  it("preserves workspace state across commands in one session", async () => {
    const opened = await input.requestRunner("/sessions", {
      language: "bash",
      code: ":",
      files: [{ path: "package.json", content: '{"name":"session-app"}\n' }],
    });
    const sessionId = opened.body.sessionId;
    expect(opened.status).toBe(201);
    expect(sessionId).toBeTypeOf("string");

    const first = await input.requestRunner(`/sessions/${sessionId}/run`, {
      language: "bash",
      code: "mkdir -p node_modules/demo && printf persistent > node_modules/demo/value.txt",
    });
    const second = await input.requestRunner(`/sessions/${sessionId}/run`, {
      language: "bash",
      code: "grep -o session-app package.json && grep -o persistent node_modules/demo/value.txt",
    });
    const closed = await input.requestRunner(
      `/sessions/${sessionId}`,
      undefined,
      "DELETE",
    );

    expect(first.body.ok).toBe(true);
    expect(second.body.ok).toBe(true);
    expect(second.body.stdout?.trim()).toBe("session-app\npersistent");
    expect(closed.status).toBe(200);
    expect(readdirSync(input.runRoot())).toEqual([]);
  });
}
