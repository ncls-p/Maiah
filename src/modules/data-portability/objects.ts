import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { digest, MAX_ARCHIVE_BYTES, type Snapshot } from "./archive";
import type { Dataset } from "./registry";

type Listed = { key: string; etag: string; size: number };
export const MAX_OBJECT_DIRECTORIES = 200_000;
export interface ObjectStore {
  /** Objects under `prefix` (whole bucket when omitted), sorted by key. */
  list(prefix?: string): Promise<Listed[]>;
  /** One level below `prefix`: sub-directories and the objects directly inside it. */
  directories?(
    prefix: string,
  ): Promise<{ directories: string[]; objects: Listed[] }>;
  read(
    key: string,
    etag?: string,
  ): Promise<{ bytes: Buffer; contentType: string }>;
  exists(key: string): Promise<boolean>;
  create(key: string, bytes: Buffer, contentType: string): Promise<string>;
  removeCreated(key: string, etag: string): Promise<void>;
}
export function s3ObjectStore(client: S3Client, bucket: string): ObjectStore {
  return {
    async list(prefix) {
      const objects = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix || undefined,
            ContinuationToken: token,
          }),
        );
        for (const item of page.Contents ?? []) {
          if (!item.Key || !item.ETag)
            throw new Error("Incomplete object inventory");
          objects.push({
            key: item.Key,
            etag: item.ETag,
            size: item.Size ?? 0,
          });
          if (objects.length > 20_000)
            throw new Error("Object inventory limit exceeded");
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && !token)
          throw new Error("Invalid storage pagination");
      } while (token);
      return objects.sort((a, b) => a.key.localeCompare(b.key));
    },
    async directories(prefix) {
      const directories: string[] = [];
      const objects: Listed[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix || undefined,
            Delimiter: "/",
            ContinuationToken: token,
          }),
        );
        for (const item of page.CommonPrefixes ?? []) {
          if (!item.Prefix) throw new Error("Incomplete object inventory");
          directories.push(item.Prefix);
          if (directories.length > MAX_OBJECT_DIRECTORIES)
            throw new Error("Object inventory limit exceeded");
        }
        for (const item of page.Contents ?? []) {
          if (!item.Key || !item.ETag)
            throw new Error("Incomplete object inventory");
          objects.push({
            key: item.Key,
            etag: item.ETag,
            size: item.Size ?? 0,
          });
          if (objects.length > 20_000)
            throw new Error("Object inventory limit exceeded");
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && !token)
          throw new Error("Invalid storage pagination");
      } while (token);
      return { directories: directories.sort(), objects };
    },
    async read(key, etag) {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key, IfMatch: etag }),
      );
      const chunks: Uint8Array[] = [];
      let length = 0;
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        length += chunk.length;
        if (length > MAX_ARCHIVE_BYTES / 2)
          throw new Error("Object size limit exceeded");
        chunks.push(chunk);
      }
      return {
        bytes: Buffer.concat(chunks),
        contentType: response.ContentType ?? "application/octet-stream",
      };
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (error) {
        if (
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode === 404
        )
          return false;
        throw error;
      }
    },
    async create(key, bytes, contentType) {
      const response = await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          IfNoneMatch: "*",
        }),
      );
      if (!response.ETag)
        throw new Error("Storage did not return an object version");
      return response.ETag;
    },
    async removeCreated(key, etag) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key, IfMatch: etag }),
      );
    },
  };
}

/** `<prefix>/<id>/metadata.json` only: user files named metadata.json are content, not ownership. */
function ownerDirectory(key: string, prefixes: Snapshot["prefixes"]) {
  for (const prefix of [prefixes.attachments, prefixes.code]) {
    if (!key.startsWith(`${prefix}/`)) continue;
    const parts = key.slice(prefix.length + 1).split("/");
    return {
      directory: `${prefix}/${parts[0]}/`,
      metadata: parts.length === 2 && parts[1] === "metadata.json",
    };
  }
  return null;
}
async function readMetadata(
  store: ObjectStore,
  object: { key: string; etag?: string },
) {
  const content = await store.read(object.key, object.etag);
  let metadata;
  try {
    metadata = JSON.parse(content.bytes.toString("utf8"));
  } catch {
    throw new Error(
      "Invalid object metadata; export aborted without omissions",
    );
  }
  if (!metadata || typeof metadata.workspaceId !== "string")
    throw new Error("Object metadata has no workspace owner");
  return metadata as {
    workspaceId: string;
    objectKey?: unknown;
    extractedTextObjectKey?: unknown;
    files?: unknown;
  };
}

export async function exportObjects(
  store: ObjectStore,
  data: Dataset,
  scope: Snapshot["scope"],
  prefixes: Snapshot["prefixes"],
): Promise<Snapshot["objects"]> {
  const inventory = await store.list();
  const selected = new Set<string>();
  const workspaceIds = new Set(data.workspaces.map((row) => row.id));
  const inventoryKeys = new Set(inventory.map((object) => object.key));
  const required = new Set(
    data.documents
      .map((row) => row.object_storage_key)
      .filter((key): key is string => typeof key === "string"),
  );
  if (scope.type === "instance")
    inventory.forEach((object) => selected.add(object.key));
  const owned = new Set<string>();
  const owners = new Set(
    inventory
      .map((object) => ownerDirectory(object.key, prefixes))
      .filter((owner) => owner?.metadata)
      .map((owner) => owner!.directory),
  );
  for (const object of inventory) {
    const [prefix, id] = object.key.split("/");
    const owner = ownerDirectory(object.key, prefixes);
    if (["knowledge", "document-uploads"].includes(prefix)) {
      if (workspaceIds.has(id)) selected.add(object.key);
    } else if (owner) {
      if (!owners.has(owner.directory)) {
        // Without owner metadata, an organization export cannot prove the file is its own.
        if (scope.type === "organization")
          throw new Error(
            "Stored files without owner metadata; organization export cannot prove isolation. Use an instance export",
          );
        continue;
      }
      if (!owner.metadata) continue;
      const metadata = await readMetadata(store, object);
      if (scope.type === "instance" || workspaceIds.has(metadata.workspaceId)) {
        owned.add(owner.directory);
        for (const key of [metadata.objectKey, metadata.extractedTextObjectKey])
          if (typeof key === "string") {
            if (!key.startsWith(owner.directory))
              throw new Error(
                "Object metadata references a file outside its owner directory",
              );
            required.add(key);
          }
        if (Array.isArray(metadata.files))
          for (const file of metadata.files)
            if (file && typeof file.path === "string")
              required.add(`${owner.directory}files/${file.path}`);
      }
    } else if (scope.type === "organization") {
      throw new Error(
        "Unknown object namespace; organization export cannot prove isolation. Use an instance export",
      );
    }
  }
  for (const object of inventory) {
    const owner = ownerDirectory(object.key, prefixes);
    if (owner && owned.has(owner.directory)) selected.add(object.key);
  }
  if (scope.type === "organization")
    for (const document of data.documents) {
      if (
        typeof document.object_storage_key === "string" &&
        !document.object_storage_key.startsWith(
          `knowledge/${document.workspace_id}/`,
        )
      )
        throw new Error("Document object key is outside its workspace");
    }
  for (const key of required) {
    if (!inventoryKeys.has(key))
      throw new Error("Referenced object is missing from storage");
    selected.add(key);
  }
  let total = 0;
  const objects: Snapshot["objects"] = [];
  for (const object of inventory.filter((entry) => selected.has(entry.key))) {
    total += object.size;
    if (total > MAX_ARCHIVE_BYTES / 2)
      throw new Error(
        "Objects exceed archive safety limit; nothing was truncated",
      );
    const downloaded = await store.read(object.key, object.etag);
    objects.push({
      key: object.key,
      contentType: downloaded.contentType,
      bytes: downloaded.bytes.toString("base64"),
      sha256: digest(downloaded.bytes),
    });
  }
  if (JSON.stringify(inventory) !== JSON.stringify(await store.list()))
    throw new Error("Storage changed during export; pause writers and retry");
  return objects;
}

function missingObject(error: unknown) {
  const failure = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  } | null;
  return (
    failure?.name === "NoSuchKey" || failure?.$metadata?.httpStatusCode === 404
  );
}
async function listUnder(store: ObjectStore, prefix: string) {
  // Stores without prefix support return the whole bucket: never trust them to filter.
  return (await store.list(prefix)).filter((object) =>
    object.key.startsWith(prefix),
  );
}
async function directoriesUnder(store: ObjectStore, prefix: string) {
  if (store.directories) return store.directories(prefix);
  const directories = new Set<string>();
  const objects: Listed[] = [];
  for (const object of await listUnder(store, prefix)) {
    const rest = object.key.slice(prefix.length);
    if (rest.includes("/"))
      directories.add(`${prefix}${rest.slice(0, rest.indexOf("/") + 1)}`);
    else objects.push(object);
  }
  return { directories: [...directories].sort(), objects };
}

/**
 * Organization export without a bucket-wide listing. Knowledge files are listed per
 * workspace. Attachment/code folders carry their owner only in metadata.json, so their
 * directory names are listed and each owner file is read; only owned folders are listed
 * in full. Unknown top-level namespaces and folders without owner metadata still refuse
 * the export. The result equals `exportObjects` for the same organization.
 */
export async function exportOrganizationObjects(
  store: ObjectStore,
  data: Dataset,
  prefixes: Snapshot["prefixes"],
): Promise<Snapshot["objects"]> {
  const unknown = () =>
    new Error(
      "Unknown object namespace; organization export cannot prove isolation. Use an instance export",
    );
  const owned = [prefixes.attachments, prefixes.code];
  const roots = new Set([
    "knowledge/",
    "document-uploads/",
    ...owned.map((prefix) => `${prefix.split("/")[0]}/`),
  ]);
  const top = await directoriesUnder(store, "");
  if (top.objects.length || top.directories.some((root) => !roots.has(root)))
    throw unknown();
  // A configured prefix below a shared root: everything else under that root is unknown.
  for (const prefix of owned.filter((candidate) => candidate.includes("/")))
    for (const object of await listUnder(store, `${prefix.split("/")[0]}/`))
      if (!owned.some((candidate) => object.key.startsWith(`${candidate}/`)))
        throw unknown();
  const workspaceIds = new Set(data.workspaces.map((row) => String(row.id)));
  const listed: string[] = [];
  for (const id of workspaceIds)
    listed.push(`knowledge/${id}/`, `document-uploads/${id}/`);
  const required = new Set(
    data.documents
      .map((row) => row.object_storage_key)
      .filter((key): key is string => typeof key === "string"),
  );
  for (const document of data.documents)
    if (
      typeof document.object_storage_key === "string" &&
      !document.object_storage_key.startsWith(
        `knowledge/${document.workspace_id}/`,
      )
    )
      throw new Error("Document object key is outside its workspace");
  const orphan = () =>
    new Error(
      "Stored files without owner metadata; organization export cannot prove isolation. Use an instance export",
    );
  const ownerDirectories: string[] = [];
  for (const prefix of owned) {
    const level = await directoriesUnder(store, `${prefix}/`);
    if (level.objects.length) throw orphan();
    ownerDirectories.push(...level.directories);
  }
  for (const directory of ownerDirectories) {
    let metadata;
    try {
      metadata = await readMetadata(store, {
        key: `${directory}metadata.json`,
      });
    } catch (error) {
      if (missingObject(error)) throw orphan();
      throw error;
    }
    if (!workspaceIds.has(metadata.workspaceId)) continue;
    listed.push(directory);
    for (const key of [metadata.objectKey, metadata.extractedTextObjectKey])
      if (typeof key === "string") {
        if (!key.startsWith(directory))
          throw new Error(
            "Object metadata references a file outside its owner directory",
          );
        required.add(key);
      }
    if (Array.isArray(metadata.files))
      for (const file of metadata.files)
        if (file && typeof file.path === "string")
          required.add(`${directory}files/${file.path}`);
  }
  const inventoryOf = async () => {
    const inventory: Listed[] = [];
    for (const prefix of listed)
      inventory.push(...(await listUnder(store, prefix)));
    if (inventory.length > 20_000)
      throw new Error("Object inventory limit exceeded");
    return inventory.sort((a, b) => a.key.localeCompare(b.key));
  };
  const inventory = await inventoryOf();
  const keys = new Set(inventory.map((object) => object.key));
  for (const key of required)
    if (!keys.has(key))
      throw new Error("Referenced object is missing from storage");
  let total = 0;
  const objects: Snapshot["objects"] = [];
  for (const object of inventory) {
    total += object.size;
    if (total > MAX_ARCHIVE_BYTES / 2)
      throw new Error(
        "Objects exceed archive safety limit; nothing was truncated",
      );
    const downloaded = await store.read(object.key, object.etag);
    objects.push({
      key: object.key,
      contentType: downloaded.contentType,
      bytes: downloaded.bytes.toString("base64"),
      sha256: digest(downloaded.bytes),
    });
  }
  if (JSON.stringify(inventory) !== JSON.stringify(await inventoryOf()))
    throw new Error("Storage changed during export; pause writers and retry");
  return objects;
}
