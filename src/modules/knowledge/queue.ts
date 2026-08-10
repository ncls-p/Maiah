import { Queue, type Job } from "bullmq";

import { workflowQueueConnection } from "@/modules/workflows/queue";

export const DOCUMENT_INGESTION_QUEUE_NAME = "{maiah-document-ingestion}";

export type DocumentIngestionJob = {
  documentId: string;
  workspaceId: string;
  knowledgeBaseId: string;
};

let queue: Queue<DocumentIngestionJob> | null = null;

type DocumentQueueClient = Pick<Queue<DocumentIngestionJob>, "add" | "getJob">;

function getDocumentIngestionQueue() {
  queue ??= new Queue<DocumentIngestionJob>(DOCUMENT_INGESTION_QUEUE_NAME, {
    connection: workflowQueueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 5_000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 10_000 },
    },
  });
  return queue;
}

export async function enqueueDocumentIngestion(
  input: DocumentIngestionJob,
  targetQueue: DocumentQueueClient = getDocumentIngestionQueue(),
) {
  const job = await targetQueue.add("embed", input, {
    jobId: input.documentId,
  });
  return { queued: true, documentId: input.documentId, jobId: job.id };
}

export async function recoverDocumentIngestionJob(
  input: DocumentIngestionJob,
  targetQueue: DocumentQueueClient = getDocumentIngestionQueue(),
) {
  const existing = await targetQueue.getJob(input.documentId);
  if (!existing) {
    await enqueueDocumentIngestion(input, targetQueue);
    return "enqueued" as const;
  }

  const state = await existing.getState();
  if (state !== "completed" && state !== "failed" && state !== "unknown") {
    return "scheduled" as const;
  }

  await (existing as Job<DocumentIngestionJob>).remove();
  await enqueueDocumentIngestion(input, targetQueue);
  return "reenqueued" as const;
}
