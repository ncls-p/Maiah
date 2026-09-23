import type { Pool, PoolClient } from "pg";
import { schemaFingerprint, type Dataset } from "./registry";
import {
  type Scope,
  type Snapshot,
  validateSnapshot,
  summarize,
} from "./archive";
import { selectOrganization, unresolvedReferences } from "./scope";
import { postgresRowSource, readOrganization } from "./scoped-read";
import { transformDatasetSecrets, type SecretCodec } from "./secrets";
import {
  assertDatabaseSchema,
  insertDataset,
  lockDatabase,
  readDataset,
} from "./postgres";
import {
  exportObjects,
  exportOrganizationObjects,
  type ObjectStore,
} from "./objects";
import { pauseRestoredData } from "./restore-policy";
import { assertReferencesAbsent, prepareTarget } from "./target";
import { transformAccountTokens } from "./oauth-tokens";

export interface PortabilityContext {
  pool: Pool;
  objects: ObjectStore;
  secrets: SecretCodec;
  authTokens: SecretCodec;
  prefixes: Snapshot["prefixes"];
  authorize?: (client: PoolClient) => Promise<void>;
}
// PostgreSQL answered the COMMIT: the transaction is known not to be committed.
// Connection loss (class 08), shutdown (57) or a missing SQLSTATE stays ambiguous.
export function isDefiniteCommitFailure(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    typeof code === "string" &&
    /^[0-9A-Z]{5}$/.test(code) &&
    !code.startsWith("08") &&
    !code.startsWith("57")
  );
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
    // An organization is read and listed with targeted queries: the archive limits
    // apply to its scope, never to the size of the whole source instance.
    let selected: Dataset;
    let objects: Snapshot["objects"];
    if (scope.type === "instance") {
      selected = await readDataset(client);
      objects = await exportObjects(
        context.objects,
        selected,
        scope,
        context.prefixes,
      );
    } else {
      await assertDatabaseSchema(client);
      selected = await readOrganization(
        postgresRowSource(client),
        scope.organizationId,
      );
      objects = await exportOrganizationObjects(
        context.objects,
        selected,
        context.prefixes,
      );
    }
    await transformAccountTokens(selected, "export", context.authTokens);
    // Rows come straight from this transaction: rewrap them in place.
    const data = await transformDatasetSecrets(
      selected,
      "export",
      context.secrets,
    );
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
  const references = unresolvedReferences(snapshot.data);
  // Shallow row copies: the caller's snapshot stays untouched, nested values are rebuilt.
  const data = Object.fromEntries(
    Object.entries(snapshot.data).map(([name, rows]) => [
      name,
      rows.map((row) => ({ ...row })),
    ]),
  ) as Dataset;
  await transformDatasetSecrets(data, "import", context.secrets);
  await transformAccountTokens(data, "import", context.authTokens);
  pauseRestoredData(data, snapshot.scope);
  const client = await context.pool.connect();
  const created: { key: string; etag: string }[] = [];
  let committed = false;
  let commitAttempted = false;
  let commitFailed: unknown;
  try {
    await client.query("begin");
    await lockDatabase(client);
    await context.authorize?.(client);
    await assertDatabaseSchema(client);
    await assertReferencesAbsent(client, references);
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
    await client.query(dryRun ? "rollback" : "commit").catch((error) => {
      commitFailed = error;
      throw error;
    });
    committed = !dryRun;
    return { ...summarize(snapshot), dryRun };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    const cleanupErrors: unknown[] = [];
    // A lost COMMIT response is ambiguous: never delete objects possibly referenced by committed rows.
    if (commitAttempted && !committed && !isDefiniteCommitFailure(commitFailed))
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
