import { randomUUID, webcrypto } from "node:crypto";
import { Client } from "pg";

import { databaseUrl, e2eUser } from "./fixtures";

export async function encryptFixtureText(plaintext: string) {
  const keyHex = process.env.APP_ENCRYPTION_KEY;
  const keyId = process.env.APP_ENCRYPTION_KEY_ID ?? "default";
  if (!keyHex) {
    throw new Error("Chat E2E encryption configuration is missing");
  }

  const key = await webcrypto.subtle.importKey(
    "raw",
    Buffer.from(keyHex, "hex"),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return JSON.stringify({
    ct: Buffer.from(ciphertext).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    kid: keyId,
  });
}

export async function createRecoveredToolConversation() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();

  try {
    const context = await client.query<{
      user_id: string;
      workspace_id: string;
    }>(
      `select u.id as user_id,
              wm.workspace_id
       from "user" u
       join workspace_members wm on wm.user_id = u.id and wm.status = 'active'
       where u.email = $1
       limit 1`,
      [e2eUser.email],
    );
    const row = context.rows[0];
    if (!row) throw new Error("No workspace available for chat E2E fixture");

    const conversationId = randomUUID();
    const userMessageId = randomUUID();
    const assistantMessageId = randomUUID();
    let agentId: string;
    let agentVersionId: string;
    let createdAgent = false;
    const finalText =
      "The first query failed, the corrected query succeeded, and the workflow completed.";

    await client.query("begin");

    const activeAgent = await client.query<{
      agent_id: string;
      agent_version_id: string;
    }>(
      `select id as agent_id, active_version_id as agent_version_id
       from agents
       where workspace_id = $1
         and archived_at is null
         and active_version_id is not null
       order by (created_by_user_id = $2) desc, created_at
       limit 1`,
      [row.workspace_id, row.user_id],
    );

    if (activeAgent.rows[0]) {
      agentId = activeAgent.rows[0].agent_id;
      agentVersionId = activeAgent.rows[0].agent_version_id;
    } else {
      agentId = randomUUID();
      agentVersionId = randomUUID();
      createdAgent = true;
      await client.query(
        `insert into agents
           (id, workspace_id, name, slug, visibility, created_by_user_id, created_at, updated_at)
         values ($1, $2, 'Recovered tool fixture', $3, 'private', $4, now(), now())`,
        [agentId, row.workspace_id, `recovered-tool-${agentId}`, row.user_id],
      );
      await client.query(
        `insert into agent_versions
           (id, agent_id, version_number, name, system_prompt, created_by_user_id, created_at)
         values ($1, $2, 1, 'Recovered tool fixture', 'E2E fixture', $3, now())`,
        [agentVersionId, agentId, row.user_id],
      );
      await client.query(
        "update agents set active_version_id = $1 where id = $2",
        [agentVersionId, agentId],
      );
    }

    await client.query(
      `insert into conversations
         (id, workspace_id, agent_id, agent_version_id, user_id, title, status, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, 'active', now(), now())`,
      [
        conversationId,
        row.workspace_id,
        agentId,
        agentVersionId,
        row.user_id,
        "Recovered tool failure E2E",
      ],
    );
    await client.query(
      `insert into messages
         (id, conversation_id, role, status, created_at, completed_at)
       values
         ($1, $3, 'user', 'completed', now() - interval '1 second', now() - interval '1 second'),
         ($2, $3, 'assistant', 'completed', now(), now())`,
      [userMessageId, assistantMessageId, conversationId],
    );
    await client.query(
      `insert into message_parts
         (id, message_id, type, content_encrypted, metadata_json, sort_order, created_at)
       values ($1, $2, 'text', $3, null, 0, now() - interval '1 second')`,
      [
        randomUUID(),
        userMessageId,
        await encryptFixtureText("Investigate and summarize the failure."),
      ],
    );
    await client.query(
      `insert into message_parts
         (id, message_id, type, content_encrypted, metadata_json, sort_order, created_at)
       values ($1, $2, 'reasoning', $3, null, 0, now())`,
      [
        randomUUID(),
        assistantMessageId,
        await encryptFixtureText(
          "Inspect the failed query before preparing a corrected retry.",
        ),
      ],
    );
    await client.query(
      `insert into message_parts
         (id, message_id, type, content_encrypted, metadata_json, sort_order, created_at)
       values ($1, $2, 'reasoning', $3, null, 2, now())`,
      [randomUUID(), assistantMessageId, await encryptFixtureText("")],
    );
    await client.query(
      `insert into message_parts
         (id, message_id, type, content_encrypted, metadata_json, sort_order, created_at)
       values
         ($1, $2, 'tool-call', null, $3::jsonb, 1, now()),
         ($4, $2, 'tool-call', null, $5::jsonb, 3, now()),
         ($6, $2, 'tool-call', null, $7::jsonb, 4, now()),
         ($8, $2, 'text', $9, null, 5, now())`,
      [
        randomUUID(),
        assistantMessageId,
        JSON.stringify({
          toolCallId: "failed-dql-call",
          toolName: "observability_execute_query",
          input: { query: "invalid query" },
          output: {
            ok: false,
            code: "tool_execution_failed",
            error: "Invalid DQL query",
          },
        }),
        randomUUID(),
        JSON.stringify({
          toolCallId: "successful-dql-retry",
          toolName: "observability_execute_query",
          input: { query: "fetch logs" },
          output: { ok: true, result: [{ id: "problem-1" }] },
        }),
        randomUUID(),
        JSON.stringify({
          toolCallId: "todo-progress",
          toolName: "update_todo_list",
          input: {},
          output: {
            kind: "chat_todo_list",
            title: "Investigation",
            items: [
              {
                id: "research",
                label: "Research the issue",
                status: "completed",
              },
              {
                id: "verify",
                label: "Verify the fix",
                status: "in_progress",
              },
            ],
            completedCount: 1,
            totalCount: 2,
          },
        }),
        randomUUID(),
        await encryptFixtureText(finalText),
      ],
    );
    await client.query("commit");

    return {
      agentId,
      conversationId,
      cleanup: async () => {
        try {
          await client.query(
            "delete from message_parts where message_id = any($1::uuid[])",
            [[userMessageId, assistantMessageId]],
          );
          await client.query(
            "delete from messages where id = any($1::uuid[])",
            [[userMessageId, assistantMessageId]],
          );
          await client.query("delete from conversations where id = $1", [
            conversationId,
          ]);
          if (createdAgent) {
            await client.query(
              "update agents set active_version_id = null where id = $1",
              [agentId],
            );
            await client.query("delete from agent_versions where id = $1", [
              agentVersionId,
            ]);
            await client.query("delete from agents where id = $1", [agentId]);
          }
        } finally {
          await client.end();
        }
      },
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    await client.end();
    throw error;
  }
}
