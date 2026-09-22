import type { Pool, PoolClient } from "pg";
import { schemaFingerprint, type Dataset } from "./registry";
import {
  type Scope,
  type Snapshot,
  validateSnapshot,
  summarize,
} from "./archive";
import { selectOrganization } from "./scope";
import { transformSecrets, type SecretCodec } from "./secrets";
import {
  assertDatabaseSchema,
  insertDataset,
  lockDatabase,
  readDataset,
} from "./postgres";
import { exportObjects, type ObjectStore } from "./objects";
import { pauseRestoredData } from "./restore-policy";
import { prepareTarget } from "./target";
import { transformAccountTokens } from "./oauth-tokens";

export interface PortabilityContext {
  pool: Pool;
  objects: ObjectStore;
  secrets: SecretCodec;
  authTokens: SecretCodec;
  prefixes: Snapshot["prefixes"];
  authorize?: (client: PoolClient) => Promise<void>;
}
export async function createSnapshot(
  context: PortabilityContext,
  scope: Scope,
): Promise<Snapshot> {
  const client = await context.pool.connect();
  try {
    await client.query("begin");
    await lockDatabase(client);
    await context.authorize?.(client);
    const all = await readDataset(client);
    const selected =
      scope.type === "instance"
        ? all
        : selectOrganization(all, scope.organizationId);
    const objects = await exportObjects(
      context.objects,
      selected,
      scope,
      context.prefixes,
    );
    await transformAccountTokens(selected, "export", context.authTokens);
    const data = (await transformSecrets(
      selected,
      "export",
      context.secrets,
    )) as Dataset;
    const snapshot = validateSnapshot({
      format: "maiah.data",
      version: 1,
      schema: schemaFingerprint,
      createdAt: new Date().toISOString(),
      scope,
      prefixes: context.prefixes,
      data,
      objects,
    });
    await client.query("commit");
    return snapshot;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
async function assertScope(snapshot: Snapshot) {
  if (snapshot.scope.type !== "organization") return;
  const selected = selectOrganization(
    snapshot.data,
    snapshot.scope.organizationId,
  );
  for (const name of Object.keys(selected) as (keyof Dataset)[])
    if (selected[name].length !== snapshot.data[name].length)
      throw new Error("Archive contains rows outside its organization scope");
  const inventory = snapshot.objects.map((object) => ({
    key: object.key,
    etag: object.sha256,
    size: Buffer.byteLength(object.bytes, "base64"),
  }));
  const memory: ObjectStore = {
    list: async () => inventory,
    read: async (key) => {
      const object = snapshot.objects.find((entry) => entry.key === key);
      if (!object) throw new Error("Missing archive object");
      return {
        bytes: Buffer.from(object.bytes, "base64"),
        contentType: object.contentType,
      };
    },
    exists: async () => false,
    create: async () => {
      throw new Error("Read-only validation store");
    },
    removeCreated: async () => {
      throw new Error("Read-only validation store");
    },
  };
  if (
    (
      await exportObjects(
        memory,
        snapshot.data,
        snapshot.scope,
        snapshot.prefixes,
      )
    ).length !== snapshot.objects.length
  )
    throw new Error("Archive contains objects outside its organization scope");
}

/** Dry run executes all SQL/constraints then rolls back. Confirmation reruns every check. */
export async function restoreSnapshot(
  context: PortabilityContext,
  input: Snapshot,
  dryRun: boolean,
) {
  const snapshot = validateSnapshot(input);
  if (JSON.stringify(snapshot.prefixes) !== JSON.stringify(context.prefixes))
    throw new Error(
      "Storage prefixes differ; configure the destination with the archive prefixes before importing",
    );
  await assertScope(snapshot);
  const data = (await transformSecrets(
    snapshot.data,
    "import",
    context.secrets,
  )) as Dataset;
  await transformAccountTokens(data, "import", context.authTokens);
  pauseRestoredData(data, snapshot.scope);
  const client = await context.pool.connect();
  const created: { key: string; etag: string }[] = [];
  let committed = false;
  let commitAttempted = false;
  try {
    await client.query("begin");
    await lockDatabase(client);
    await context.authorize?.(client);
    await assertDatabaseSchema(client);
    // Constraints and uniqueness are checked before touching object storage.
    await prepareTarget(client, data, snapshot.scope);
    await insertDataset(client, data);
    for (const object of snapshot.objects) {
      if (await context.objects.exists(object.key))
        throw new Error(
          "An object already exists on the destination; import aborted without overwriting",
        );
    }
    if (!dryRun)
      for (const object of snapshot.objects) {
        const etag = await context.objects.create(
          object.key,
          Buffer.from(object.bytes, "base64"),
          object.contentType,
        );
        created.push({ key: object.key, etag });
      }
    commitAttempted = !dryRun;
    await client.query(dryRun ? "rollback" : "commit");
    committed = !dryRun;
    return { ...summarize(snapshot), dryRun };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    const cleanupErrors: unknown[] = [];
    // A lost COMMIT response is ambiguous: never delete objects possibly referenced by committed rows.
    if (commitAttempted && !committed)
      throw new Error(
        "Commit outcome is uncertain; inspect the destination before retrying or cleaning objects",
        { cause: error },
      );
    if (!committed)
      for (const object of created.reverse()) {
        try {
          await context.objects.removeCreated(object.key, object.etag);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
    if (cleanupErrors.length)
      throw new AggregateError(
        [error, ...cleanupErrors],
        "Import failed; staging objects require operator cleanup",
      );
    throw error;
  } finally {
    client.release();
  }
}
