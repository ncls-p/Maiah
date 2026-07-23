import { beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(),
  construct: vi.fn(),
  getJob: vi.fn(),
  env: {
    DRAGONFLY_URL: "redis://cache.example.test:6379/0",
    DRAGONFLY_PASSWORD: "",
  },
}));

vi.mock("bullmq", () => ({
  Queue: class Queue {
    constructor(name: string, options: unknown) {
      queueMocks.construct(name, options);
    }

    add = queueMocks.add;
    getJob = queueMocks.getJob;
  },
}));

vi.mock("@/lib/env", () => ({ env: queueMocks.env }));

import {
  WORKFLOW_NODE_CATALOG,
  WORKFLOW_NODE_CATEGORIES,
  workflowNodeCatalogItem,
} from "@/modules/workflows/catalog";
import {
  WORKFLOW_QUEUE_NAME,
  enqueueWorkflowRun,
  recoverWorkflowRunJob,
  workflowQueueConnection,
} from "@/modules/workflows/queue";

describe("workflow no-code catalog", () => {
  it("declares one complete, unique entry for every supported node", () => {
    expect(WORKFLOW_NODE_CATALOG).toHaveLength(21);
    expect(new Set(WORKFLOW_NODE_CATALOG.map((item) => item.type)).size).toBe(
      WORKFLOW_NODE_CATALOG.length,
    );
    expect(WORKFLOW_NODE_CATEGORIES).toEqual([
      "all",
      "trigger",
      "ai",
      "integration",
      "data",
      "logic",
      "code",
    ]);

    for (const item of WORKFLOW_NODE_CATALOG) {
      expect(workflowNodeCatalogItem(item.type)).toBe(item);
      expect(item.label).not.toBe("");
      expect(item.description).not.toBe("");
      expect(item.fields).toBeDefined();
      expect(item.defaultParameters).toEqual(expect.any(Object));
    }
  });

  it("rejects unknown node types", () => {
    expect(() => workflowNodeCatalogItem("unknown.node" as never)).toThrow(
      "Unknown workflow node type",
    );
  });
});

describe("workflow BullMQ queue", () => {
  beforeEach(() => {
    queueMocks.add.mockReset().mockResolvedValue(undefined);
    queueMocks.construct.mockClear();
    queueMocks.getJob.mockReset().mockResolvedValue(undefined);
    queueMocks.env.DRAGONFLY_URL = "redis://cache.example.test:6379/0";
    queueMocks.env.DRAGONFLY_PASSWORD = "";
  });

  it("builds Redis and TLS connections from Dragonfly configuration", () => {
    expect(workflowQueueConnection()).toEqual({
      host: "cache.example.test",
      port: 6379,
      username: undefined,
      password: undefined,
      db: 0,
      tls: undefined,
      maxRetriesPerRequest: null,
    });

    queueMocks.env.DRAGONFLY_URL =
      "rediss://queue-user:url-password@secure.example.test:6380/4";
    queueMocks.env.DRAGONFLY_PASSWORD = "configured-password";

    expect(workflowQueueConnection()).toEqual({
      host: "secure.example.test",
      port: 6380,
      username: "queue-user",
      password: "configured-password",
      db: 4,
      tls: {},
      maxRetriesPerRequest: null,
    });
  });

  it("creates one queue with durable defaults and enqueues named jobs", async () => {
    await enqueueWorkflowRun("run-1");
    await enqueueWorkflowRun("run-2");

    expect(queueMocks.construct).toHaveBeenCalledTimes(1);
    expect(queueMocks.construct).toHaveBeenCalledWith(
      WORKFLOW_QUEUE_NAME,
      expect.objectContaining({
        defaultJobOptions: expect.objectContaining({
          attempts: 3,
          backoff: { type: "exponential", delay: 1_000 },
        }),
      }),
    );
    expect(queueMocks.add).toHaveBeenNthCalledWith(
      1,
      "execute",
      { runId: "run-1" },
      { jobId: "run-1" },
    );
    expect(queueMocks.add).toHaveBeenNthCalledWith(
      2,
      "execute",
      { runId: "run-2" },
      { jobId: "run-2" },
    );
  });

  it("recovers missing and failed jobs without duplicating scheduled work", async () => {
    await expect(recoverWorkflowRunJob("missing")).resolves.toBe("enqueued");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "execute",
      { runId: "missing" },
      { jobId: "missing" },
    );

    const retry = vi.fn().mockResolvedValue(undefined);
    const getState = vi.fn().mockResolvedValue("failed");
    queueMocks.getJob.mockResolvedValueOnce({ getState, retry });
    await expect(recoverWorkflowRunJob("failed")).resolves.toBe("retried");
    expect(retry).toHaveBeenCalledTimes(1);

    queueMocks.getJob.mockResolvedValueOnce({
      getState: vi.fn().mockResolvedValue("waiting"),
      retry,
    });
    await expect(recoverWorkflowRunJob("waiting")).resolves.toBe("scheduled");
    expect(retry).toHaveBeenCalledTimes(1);

    queueMocks.getJob.mockResolvedValueOnce({
      getState: vi.fn().mockResolvedValue("completed"),
      retry,
    });
    await expect(recoverWorkflowRunJob("completed")).resolves.toBe("completed");
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
