import { Queue, type ConnectionOptions } from "bullmq";

import { env } from "@/lib/env";

export const WORKFLOW_QUEUE_NAME = "{maiah-workflow-runs}";

let queue: Queue<{ runId: string }> | null = null;

type WorkflowQueueClient = Pick<
  Queue<{ runId: string }>,
  "add" | "getJob"
>;

export type WorkflowRunRecoveryResult =
  | "enqueued"
  | "retried"
  | "scheduled"
  | "completed";

export function workflowQueueConnection(): ConnectionOptions {
  const url = new URL(env.DRAGONFLY_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: env.DRAGONFLY_PASSWORD || url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

function getWorkflowQueue() {
  queue ??= new Queue<{ runId: string }>(WORKFLOW_QUEUE_NAME, {
    connection: workflowQueueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
    },
  });
  return queue;
}

export async function enqueueWorkflowRun(runId: string) {
  await getWorkflowQueue().add("execute", { runId }, { jobId: runId });
}

export async function recoverWorkflowRunJob(
  runId: string,
  targetQueue: WorkflowQueueClient = getWorkflowQueue(),
): Promise<WorkflowRunRecoveryResult> {
  const existingJob = await targetQueue.getJob(runId);
  if (!existingJob) {
    await targetQueue.add("execute", { runId }, { jobId: runId });
    return "enqueued";
  }

  const state = await existingJob.getState();
  if (state === "unknown") {
    await targetQueue.add("execute", { runId }, { jobId: runId });
    return "enqueued";
  }
  if (state === "completed") return "completed";
  if (state !== "failed") return "scheduled";

  try {
    await existingJob.retry();
    return "retried";
  } catch (error) {
    const currentState = await existingJob.getState();
    if (currentState === "completed") return "completed";
    if (currentState !== "failed") return "scheduled";
    throw error;
  }
}
