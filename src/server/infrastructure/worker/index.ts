import http from "node:http";
import { Worker } from "bullmq";
import { env } from "@/lib/env";
import { logger, logHandledError } from "@/lib/logger";
import {
  dequeueDocumentIngestionJob,
  listProcessingDocuments,
  processDocumentIngestion,
} from "@/modules/knowledge/use-cases";
import { syncMcpTools } from "@/modules/mcp/use-cases";
import { processDueScheduledTasks } from "@/modules/scheduled-tasks/use-cases";
import {
  failQueuedWorkflowRun,
  listQueuedWorkflowRunIds,
  processWorkflowRun,
} from "@/modules/workflows/use-cases";
import {
  recoverWorkflowRunJob,
  WORKFLOW_QUEUE_NAME,
  workflowQueueConnection,
} from "@/modules/workflows/queue";

type WorkerJob =
  | {
      type: "document_ingestion";
      documentId: string;
    }
  | {
      type: "mcp_sync";
      serverId: string;
      workspaceId: string;
      userId: string;
    };

const jobQueue: WorkerJob[] = [];

export function enqueueWorkerJob(job: WorkerJob) {
  jobQueue.push(job);
}

async function processJob(job: WorkerJob) {
  if (job.type === "document_ingestion") {
    await processDocumentIngestion(job.documentId);
    return;
  }

  await syncMcpTools(job.serverId, job.workspaceId, job.userId);
}

async function drainQueues() {
  while (jobQueue.length > 0) {
    const job = jobQueue.shift();
    if (!job) continue;
    try {
      await processJob(job);
    } catch (error) {
      logHandledError("Worker job failed", {
        type: job.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const ingestionJob = dequeueDocumentIngestionJob();
  if (ingestionJob) {
    try {
      await processDocumentIngestion(ingestionJob.documentId);
    } catch (error) {
      logHandledError("Document ingestion failed", {
        documentId: ingestionJob.documentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const pendingDocuments = await listProcessingDocuments();
  for (const document of pendingDocuments) {
    try {
      await processDocumentIngestion(document.id);
    } catch (error) {
      logHandledError("Document ingestion failed", {
        documentId: document.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    await processDueScheduledTasks();
  } catch (error) {
    logHandledError("Scheduled task drain failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function recoverQueuedWorkflowRuns() {
  let runIds: string[];
  try {
    runIds = await listQueuedWorkflowRunIds();
  } catch (error) {
    logHandledError("Failed to list queued workflow runs", {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  for (const runId of runIds) {
    try {
      const recovery = await recoverWorkflowRunJob(runId);
      if (recovery === "completed") {
        await failQueuedWorkflowRun(
          runId,
          "Workflow queue job completed without finalizing the run",
        );
      }
    } catch (error) {
      logHandledError("Failed to recover queued workflow run", {
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function main() {
  logger.info("Worker starting...", { env: env.NODE_ENV });

  const workflowWorker = new Worker<{ runId: string }>(
    WORKFLOW_QUEUE_NAME,
    async (job) => processWorkflowRun(job.data.runId),
    {
      connection: workflowQueueConnection(),
      concurrency: 4,
    },
  );
  workflowWorker.on("failed", (job, error) => {
    logHandledError("Workflow run job failed", {
      runId: job?.data.runId,
      attemptsMade: job?.attemptsMade,
      error: error.message,
    });
  });
  workflowWorker.on("error", (error) => {
    logHandledError("Workflow queue worker error", { error: error.message });
  });

  await recoverQueuedWorkflowRuns();

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", worker: true }));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(3001, () => {
    logger.info("Worker listening on port 3001");
  });

  const interval = setInterval(() => {
    void drainQueues();
  }, 2_000);
  const workflowRecoveryInterval = setInterval(() => {
    void recoverQueuedWorkflowRuns();
  }, 30_000);

  process.on("SIGTERM", () => {
    logger.info("Worker received SIGTERM, shutting down gracefully...");
    clearInterval(interval);
    clearInterval(workflowRecoveryInterval);
    server.close(() => {
      void workflowWorker.close().finally(() => process.exit(0));
    });
  });

  process.on("SIGINT", () => {
    logger.info("Worker received SIGINT, shutting down gracefully...");
    clearInterval(interval);
    clearInterval(workflowRecoveryInterval);
    server.close(() => {
      void workflowWorker.close().finally(() => process.exit(0));
    });
  });
}

void main().catch((error) => {
  logHandledError("Worker failed to start", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
