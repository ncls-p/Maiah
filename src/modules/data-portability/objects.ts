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

export interface ObjectStore {
  list(): Promise<{ key: string; etag: string; size: number }[]>;
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
    async list() {
      const objects = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
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
  {
    for (const object of inventory) {
      const [prefix, id] = object.key.split("/");
      if (["knowledge", "document-uploads"].includes(prefix)) {
        if (workspaceIds.has(id)) selected.add(object.key);
      } else if (
        object.key.startsWith(`${prefixes.attachments}/`) ||
        object.key.startsWith(`${prefixes.code}/`)
      ) {
        if (object.key.endsWith("/metadata.json")) {
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
          if (
            scope.type === "instance" ||
            workspaceIds.has(metadata.workspaceId)
          ) {
            const directory = object.key.slice(0, -"metadata.json".length);
            inventory
              .filter((candidate) => candidate.key.startsWith(directory))
              .forEach((candidate) => selected.add(candidate.key));
            for (const key of [
              metadata.objectKey,
              metadata.extractedTextObjectKey,
            ])
              if (typeof key === "string") {
                if (!key.startsWith(directory))
                  throw new Error(
                    "Object metadata references a file outside its owner directory",
                  );
                required.add(key);
              }
            if (Array.isArray(metadata.files))
              for (const file of metadata.files)
                required.add(`${directory}files/${file.path}`);
          }
        }
      } else if (scope.type === "organization") {
        throw new Error(
          "Unknown object namespace; organization export cannot prove isolation. Use an instance export",
        );
      }
    }
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
