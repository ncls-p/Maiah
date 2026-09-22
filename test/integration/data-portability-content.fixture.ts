import { createHash, randomUUID } from "node:crypto";
import type { PortabilityContext } from "@/modules/data-portability/service";
import type { Row, TableName } from "@/modules/data-portability/registry";

export async function seedPortableContent(
  context: PortabilityContext,
  id: Record<string, string>,
  insert: (name: TableName, row: Row) => Promise<void>,
  secret: string,
  now: string,
  future: string,
) {
  await insert("conversations", {
    id: id.conversation,
    workspace_id: id.workspace,
    agent_id: id.agent,
    agent_version_id: id.version,
    user_id: id.user,
    title: "Private conversation",
    summary_encrypted: secret,
  });
  await insert("messages", {
    id: id.message,
    conversation_id: id.conversation,
    role: "assistant",
    status: "completed",
    provider_id: id.provider,
    model_id: id.model,
  });
  await insert("message_parts", {
    message_id: id.message,
    type: "text",
    content_encrypted: secret,
  });
  await insert("message_parts", {
    message_id: id.message,
    type: "file",
    metadata_json: { attachmentId: id.attachment, projectId: id.code },
  });
  await insert("knowledge_bases", {
    id: id.knowledge,
    workspace_id: id.workspace,
    name: "Knowledge",
    created_by_user_id: id.user,
  });
  await insert("documents", {
    id: id.document,
    workspace_id: id.workspace,
    knowledge_base_id: id.knowledge,
    title: "Document",
    source_type: "upload",
    object_storage_key: `knowledge/${id.workspace}/${id.document}/source`,
    status: "ready",
    created_by_user_id: id.user,
  });
  await insert("document_chunks", {
    id: id.chunk,
    document_id: id.document,
    chunk_index: 0,
    content_encrypted: secret,
    token_count: 42,
  });
  await insert("document_embeddings", {
    chunk_id: id.chunk,
    embedding: `[${Array(1536).fill(0.1).join(",")}]`,
    embedding_json: [0.1, 0.2],
    embedding_dimensions: 2,
    embedding_model_id: "embedding-test",
  });
  await insert("agent_knowledge_bindings", {
    agent_version_id: id.version,
    knowledge_base_id: id.knowledge,
  });
  await insert("workflows", {
    id: id.workflow,
    workspace_id: id.workspace,
    created_by_user_id: id.user,
    name: "Workflow",
    status: "active",
  });
  await insert("workflow_versions", {
    id: id.workflowVersion,
    workflow_id: id.workflow,
    version: 1,
    definition_json: { nodes: [], edges: [] },
    created_by_user_id: id.user,
  });
  await insert("workflow_runs", {
    id: id.workflowRun,
    workspace_id: id.workspace,
    workflow_id: id.workflow,
    workflow_version_id: id.workflowVersion,
    status: "queued",
    trigger: "manual",
  });
  await insert("scheduled_tasks", {
    id: id.task,
    workspace_id: id.workspace,
    user_id: id.user,
    agent_id: id.agent,
    title: "Scheduled",
    prompt: "Do not resume",
    frequency: "daily",
    timezone: "UTC",
    time_of_day: "12:00",
    next_run_at: future,
    last_workflow_run_id: id.workflowRun,
  });
  await insert("agent_runs", {
    id: id.run,
    workspace_id: id.workspace,
    agent_id: id.agent,
    agent_version_id: id.version,
    root_run_id: id.run,
    trigger: "api",
    actor_principal_type: "user",
    actor_principal_id: id.user,
    status: "queued",
    input_encrypted: secret,
    deadline_at: future,
  });
  await insert("workspace_token_reservations", {
    workspace_id: id.workspace,
    run_id: id.run,
    period_start: now,
    reserved_tokens: 50,
    expires_at: future,
  });
  await insert("usage_events", {
    workspace_id: id.workspace,
    user_id: id.user,
    provider_id: id.provider,
    model_id: id.model,
    agent_id: id.agent,
    conversation_id: id.conversation,
    operation: "chat",
    input_tokens: 123,
    output_tokens: 456,
    cost_usd: "0.12345678",
  });
  await insert("usage_limits", {
    id: id.limit,
    subject_type: "workspace",
    subject_id: id.workspace,
    period: "month",
    token_limit: "9007199254740993",
    created_by_id: id.user,
  });
  await insert("usage_limit_charges", {
    limit_id: id.limit,
    invocation_id: randomUUID(),
    user_id: id.user,
    tokens: 579,
    cost_usd: "0.12345678",
    status: "settled",
  });
  const owner = (
    await context.pool.query(
      "select id from roles where name = 'organization.owner'",
    )
  ).rows[0].id;
  await insert("role_bindings", {
    principal_type: "user",
    principal_id: id.user,
    role_id: owner,
    resource_type: "organization",
    resource_id: id.org,
    created_by_user_id: id.user,
  });
  await insert("audit_events", {
    organization_id: id.org,
    workspace_id: id.workspace,
    action: "fixture.created",
    outcome: "success",
    actor_principal_type: "user",
    actor_principal_id: id.user,
  });
  const file = Buffer.from("Portable binary\0\xff", "latin1");
  await context.objects.create(
    `knowledge/${id.workspace}/${id.document}/source`,
    file,
    "application/octet-stream",
  );
  await context.objects.create(
    `chat-attachments/${id.attachment}/data.bin`,
    file,
    "application/octet-stream",
  );
  await context.objects.create(
    `chat-attachments/${id.attachment}/metadata.json`,
    Buffer.from(
      JSON.stringify({
        id: id.attachment,
        kind: "chat_file",
        fileName: "portable.bin",
        mimeType: "application/octet-stream",
        size: file.length,
        hash: createHash("sha256").update(file).digest("hex"),
        url: `/api/workspace/chat-attachments/${id.attachment}`,
        category: "file",
        extractionStatus: "unreadable",
        extractedTextChars: 0,
        createdAt: now,
        workspaceId: id.workspace,
        createdByUserId: id.user,
        objectKey: `chat-attachments/${id.attachment}/data.bin`,
      }),
    ),
    "application/json",
  );
  await context.objects.create(
    `code-workspaces/${id.code}/files/main.txt`,
    file,
    "text/plain",
  );
  await context.objects.create(
    `code-workspaces/${id.code}/metadata.json`,
    Buffer.from(
      JSON.stringify({
        id: id.code,
        workspaceId: id.workspace,
        createdByUserId: id.user,
        title: "Portable code",
        rootFile: "main.txt",
        version: 1,
        previewToken: "local-portability-preview-token",
        createdAt: now,
        updatedAt: now,
        files: [
          {
            path: "main.txt",
            size: file.length,
            mimeType: "text/plain",
            binary: false,
            hash: createHash("sha256").update(file).digest("hex"),
            updatedAt: now,
          },
        ],
      }),
    ),
    "application/json",
  );
  await context.objects.create(
    `knowledge/${id.otherWorkspace}/unrelated/source`,
    Buffer.from("other-organization"),
    "text/plain",
  );
}
