import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import {
  connectPortability,
  type ConnectionConfig,
} from "@/modules/data-portability/context";
import {
  createSnapshot,
  restoreSnapshot,
} from "@/modules/data-portability/service";
import {
  openSnapshot,
  sealSnapshot,
  type Snapshot,
} from "@/modules/data-portability/archive";
import { readDataset } from "@/modules/data-portability/postgres";
import { tableNames } from "@/modules/data-portability/registry";
import { transformSecrets } from "@/modules/data-portability/secrets";
import { pauseRestoredData } from "@/modules/data-portability/restore-policy";
import { seedPortability } from "./data-portability.fixture";
import { transformAccountTokens } from "@/modules/data-portability/oauth-tokens";

const enabled = process.env.RUN_DATA_PORTABILITY_E2E === "1";
const localUrl =
  "postgres://postgres:deo62-local-only@127.0.0.1:15462/postgres";
const password = "local-portability-test-passphrase";
const clients: ReturnType<typeof connectPortability>[] = [];
const configs: ConnectionConfig[] = [];
let admin: Pool;
let storage: S3Client;
let ids: Record<string, string>;
let snapshot: Snapshot;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const names = ["source", "instance", "organization", "failure"].map(
  (name) => `deo62_${name}_${suffix}`,
);
const dialect = new PgDialect();
async function read(index: number) {
  const client = await clients[index].context.pool.connect();
  try {
    return await readDataset(client);
  } finally {
    client.release();
  }
}
function sortedRows(rows: unknown[]) {
  return rows.map((row) => JSON.stringify(row)).sort();
}
describe.skipIf(!enabled)(
  "portability: real PostgreSQL + S3 across isolated instances",
  () => {
    beforeAll(async () => {
      admin = new Pool({ connectionString: localUrl });
      storage = new S3Client({
        endpoint: "http://127.0.0.1:19462",
        region: "us-east-1",
        forcePathStyle: true,
        credentials: {
          accessKeyId: "deo62local",
          secretAccessKey: "deo62-local-storage-only",
        },
      });
      for (const [index, name] of names.entries()) {
        const query = dialect.sqlToQuery(
          sql`create database ${sql.identifier(name)}`,
        );
        await admin.query(query.sql, query.params);
        await storage.send(
          new CreateBucketCommand({ Bucket: name.replaceAll("_", "-") }),
        );
        const config: ConnectionConfig = {
          databaseUrl: localUrl.replace(/\/postgres$/, `/${name}`),
          databaseSsl: false,
          encryptionKey: String(index + 1).repeat(64),
          encryptionKeyId: `key-${index}`,
          authSecret: `independent-auth-secret-for-instance-${index}`,
          storage: {
            endpoint: "http://127.0.0.1:19462",
            region: "us-east-1",
            bucket: name.replaceAll("_", "-"),
            accessKeyId: "deo62local",
            secretAccessKey: "deo62-local-storage-only",
            forcePathStyle: true,
          },
          prefixes: {
            attachments: "chat-attachments",
            code: "code-workspaces",
          },
        };
        configs.push(config);
        const connection = connectPortability(config);
        clients.push(connection);
        await migrate(drizzle(connection.context.pool), {
          migrationsFolder: "src/server/infrastructure/db/migrations",
        });
        if (index === 2)
          await connection.context.pool.query(
            "insert into public.\"user\" (name, email, role) values ('Target administrator', 'target@example.test', 'admin')",
          );
      }
      ids = await seedPortability(clients[0].context);
      snapshot = await openSnapshot(
        await sealSnapshot(
          await createSnapshot(clients[0].context, { type: "instance" }),
          password,
        ),
        password,
      );
    }, 120_000);
    afterAll(async () => {
      for (const [index, client] of clients.entries()) {
        try {
          const objects = await client.context.objects.list();
          if (objects.length)
            await storage.send(
              new DeleteObjectsCommand({
                Bucket: configs[index].storage.bucket,
                Delete: { Objects: objects.map(({ key }) => ({ Key: key })) },
              }),
            );
          await storage.send(
            new DeleteBucketCommand({ Bucket: configs[index].storage.bucket }),
          );
        } finally {
          await client.close();
        }
      }
      if (admin) {
        for (const name of names) {
          const query = dialect.sqlToQuery(
            sql`drop database if exists ${sql.identifier(name)} with (force)`,
          );
          await admin.query(query.sql, query.params);
        }
        await admin.end();
      }
      storage?.destroy();
    }, 60_000);
    it("previews without writes, restores every table and byte, rewraps credentials, preserves precise usage", async () => {
      const before = await read(1);
      const preview = await restoreSnapshot(clients[1].context, snapshot, true);
      expect(preview.objects).toBe(6);
      expect(await read(1)).toEqual(before);
      expect(await clients[1].context.objects.list()).toHaveLength(0);
      await restoreSnapshot(clients[1].context, snapshot, false);
      const restored = await read(1);
      const expected = (await transformSecrets(
        snapshot.data,
        "import",
        clients[1].context.secrets,
      )) as typeof restored;
      await transformAccountTokens(
        expected,
        "import",
        clients[1].context.authTokens,
      );
      pauseRestoredData(expected, snapshot.scope);
      // Re-encryption uses fresh IVs. Compare decrypted values, not random ciphertext.
      const normalized = (await transformSecrets(
        restored,
        "export",
        clients[1].context.secrets,
      )) as typeof restored;
      const normalizedExpected = (await transformSecrets(
        expected,
        "export",
        clients[1].context.secrets,
      )) as typeof restored;
      await transformAccountTokens(
        normalized,
        "export",
        clients[1].context.authTokens,
      );
      await transformAccountTokens(
        normalizedExpected,
        "export",
        clients[1].context.authTokens,
      );
      for (const name of tableNames)
        expect(sortedRows(normalized[name]), name).toEqual(
          sortedRows(normalizedExpected[name]),
        );
      expect(restored.usage_limits[0].token_limit).toBe("9007199254740993");
      expect(
        restored.account.find((row) => row.provider_id === "credential")
          ?.refresh_token,
      ).toBe("oauth-refresh-token");
      const microsoft = restored.account.find(
        (row) => row.provider_id === "microsoft",
      )!;
      expect(
        await clients[1].context.authTokens.decrypt(
          String(microsoft.refresh_token),
        ),
      ).toBe("microsoft-refresh-token");
      expect(restored.workspace_api_keys[0].key_hash).toBe(
        "api-key-hash-preserved",
      );
      expect(
        await clients[1].context.secrets.decrypt(
          String(restored.mcp_oauth_credentials[0].encrypted_data),
        ),
      ).toBe("portable-secret-not-for-logs");
      for (const object of snapshot.objects)
        expect(
          (await clients[1].context.objects.read(object.key)).bytes.toString(
            "base64",
          ),
        ).toBe(object.bytes);
      await expect(
        restoreSnapshot(clients[1].context, snapshot, false),
      ).rejects.toThrow();
      expect(await read(1)).toEqual(restored);
    }, 120_000);
    it("migrates only the organization while preserving users, MCP, connectors, usage and scoped settings", async () => {
      const scoped = await createSnapshot(clients[0].context, {
        type: "organization",
        organizationId: ids.org,
      });
      expect(scoped.data.organizations).toHaveLength(1);
      expect(scoped.data.organization_members).toHaveLength(1);
      expect(scoped.data.user.map((row) => row.id)).toEqual([ids.user]);
      expect(scoped.data.app_settings).toHaveLength(1);
      expect(scoped.objects).toHaveLength(5);
      await restoreSnapshot(clients[2].context, scoped, true);
      await restoreSnapshot(clients[2].context, scoped, false);
      const restored = await read(2);
      expect(restored.organizations.map((row) => row.id)).toEqual([ids.org]);
      expect(
        restored.user.find((user) => user.id === ids.user)?.role,
      ).toBeNull();
      expect(restored.mcp_oauth_credentials).toHaveLength(1);
      expect(restored.usage_events[0].input_tokens).toBe(123);
      expect(restored.role_bindings).toHaveLength(1);
      expect(await clients[2].context.objects.list()).toHaveLength(5);
    }, 120_000);
    it("rolls back SQL and compensates uploaded objects on storage failure", async () => {
      const target = clients[3].context;
      const before = await read(3);
      let writes = 0;
      const failing = {
        ...target,
        objects: {
          ...target.objects,
          create: async (key: string, bytes: Buffer, contentType: string) => {
            if (++writes === 3) throw new Error("Injected storage failure");
            return target.objects.create(key, bytes, contentType);
          },
        },
      };
      await expect(restoreSnapshot(failing, snapshot, false)).rejects.toThrow(
        /Injected/,
      );
      expect(await read(3)).toEqual(before);
      expect(await target.objects.list()).toHaveLength(0);
    }, 120_000);
    it("does not overwrite a destination object or accept a missing referenced source file", async () => {
      const target = clients[3].context;
      const object = snapshot.objects[0];
      const etag = await target.objects.create(
        object.key,
        Buffer.from("destination-owned"),
        "text/plain",
      );
      await expect(restoreSnapshot(target, snapshot, true)).rejects.toThrow(
        /already exists/,
      );
      expect((await target.objects.read(object.key)).bytes.toString()).toBe(
        "destination-owned",
      );
      await target.objects.removeCreated(object.key, etag);
      const missing = {
        ...clients[0].context,
        objects: {
          ...clients[0].context.objects,
          list: async () =>
            (await clients[0].context.objects.list()).filter(
              ({ key }) =>
                key !== `knowledge/${ids.workspace}/${ids.document}/source`,
            ),
        },
      };
      await expect(
        createSnapshot(missing, { type: "instance" }),
      ).rejects.toThrow(/missing/);
    }, 120_000);
  },
);
