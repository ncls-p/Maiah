import { randomUUID } from "node:crypto";

import { Queue, type ConnectionOptions } from "bullmq";
import { describe, expect, it } from "vitest";

import { WORKFLOW_QUEUE_NAME } from "@/modules/workflows/queue";

const dragonflyUrl = process.env.DRAGONFLY_INTEGRATION_URL;
const describeWithDragonfly = dragonflyUrl ? describe : describe.skip;

function connectionFromUrl(value: string): ConnectionOptions {
  const url = new URL(value);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

describeWithDragonfly("BullMQ workflow queue on Dragonfly", () => {
  it("adds and reads a workflow job through BullMQ's Lua script", async () => {
    const runId = randomUUID();
    const queue = new Queue<{ runId: string }>(WORKFLOW_QUEUE_NAME, {
      connection: connectionFromUrl(dragonflyUrl!),
      prefix: `maiah-integration-${randomUUID()}`,
    });

    try {
      await queue.waitUntilReady();

      const added = await queue.add("execute", { runId }, { jobId: runId });
      const stored = await queue.getJob(runId);

      expect(added.id).toBe(runId);
      expect(stored?.name).toBe("execute");
      expect(stored?.data).toEqual({ runId });
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
