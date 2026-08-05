import { beforeEach,describe,expect,it,vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(),
  construct: vi.fn(),
  getJob: vi.fn(),
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

vi.mock("@/modules/workflows/queue", () => ({
  workflowQueueConnection: () => ({ host: "redis.test", port: 6379 }),
}));

import {
DOCUMENT_INGESTION_QUEUE_NAME,
enqueueDocumentIngestion,
recoverDocumentIngestionJob,
} from "@/modules/knowledge/queue";

const input = {
  documentId: "doc-1",
  workspaceId: "workspace-1",
  knowledgeBaseId: "knowledge-base-1",
};

describe("persistent document ingestion queue", () => {
  beforeEach(() => {
    queueMocks.add.mockReset().mockResolvedValue({ id: "doc-1" });
    queueMocks.getJob.mockReset().mockResolvedValue(undefined);
    queueMocks.construct.mockClear();
  });

  it("uses durable retry defaults and a deterministic job id", async () => {
    await enqueueDocumentIngestion(input);

    expect(queueMocks.construct).toHaveBeenCalledWith(
      DOCUMENT_INGESTION_QUEUE_NAME,
      expect.objectContaining({
        defaultJobOptions: expect.objectContaining({
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
        }),
      }),
    );
    expect(queueMocks.add).toHaveBeenCalledWith("embed", input, {
      jobId: "doc-1",
    });
  });

  it("does not duplicate a job that is already scheduled", async () => {
    const target = {
      add: vi.fn(),
      getJob: vi.fn().mockResolvedValue({
        getState: vi.fn().mockResolvedValue("waiting"),
      }),
    };

    await expect(recoverDocumentIngestionJob(input, target)).resolves.toBe(
      "scheduled",
    );
    expect(target.add).not.toHaveBeenCalled();
  });

  it("re-enqueues terminal jobs whose database row is still processing", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const target = {
      add: vi.fn().mockResolvedValue({ id: "doc-1" }),
      getJob: vi.fn().mockResolvedValue({
        getState: vi.fn().mockResolvedValue("failed"),
        remove,
      }),
    };

    await expect(recoverDocumentIngestionJob(input, target)).resolves.toBe(
      "reenqueued",
    );
    expect(remove).toHaveBeenCalled();
    expect(target.add).toHaveBeenCalledWith("embed", input, {
      jobId: "doc-1",
    });
  });
});
