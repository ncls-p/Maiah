import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  isProbablyText,
  mimeTypeForPath,
} from "./sandbox-runner.prepare-run.mjs";
import {
  maxCollectedFileBytes,
  maxCollectedFiles,
  maxDownloadFileBytes,
  maxDownloadTotalBytes,
  maxFilePreviewBytes,
} from "./sandbox-runner.socket-path.mjs";

export async function collectFiles(root, inputHashes) {
  const collected = [];
  const visited = new Set();
  let embeddedBytes = 0;
  async function walk(directory, prefix = "") {
    if (collected.length >= maxCollectedFiles) return;
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => [],
    );
    for (const entry of entries) {
      if (collected.length >= maxCollectedFiles) return;
      if ([".git", "node_modules", "home", "tmp"].includes(entry.name)) {
        continue;
      }
      if (
        entry.name.startsWith(".maiah-") ||
        entry.name === ".stdin" ||
        entry.name === ".stdout"
      ) {
        continue;
      }
      const absolutePath = path.join(directory, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      visited.add(relativePath);
      const stats = await lstat(absolutePath);
      if (stats.size > maxCollectedFileBytes) {
        collected.push({
          path: relativePath,
          size: stats.size,
          mimeType: mimeTypeForPath(relativePath),
          skipped: "too_large",
          fromInput: inputHashes.has(relativePath),
          modified: true,
        });
        continue;
      }
      const bytes = await readFile(absolutePath);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const originalHash = inputHashes.get(relativePath);
      const file = {
        path: relativePath,
        size: stats.size,
        mimeType: mimeTypeForPath(relativePath),
        hash,
        fromInput: inputHashes.has(relativePath),
        modified: originalHash ? originalHash !== hash : true,
      };
      if (isProbablyText(bytes, relativePath)) {
        const previewBytes = bytes.subarray(0, maxFilePreviewBytes);
        file.textPreview = previewBytes.toString("utf8");
        file.truncated = bytes.byteLength > maxFilePreviewBytes;
      }
      if (!file.modified) {
        // Unchanged inputs need only their metadata in the response.
      } else if (bytes.byteLength > maxDownloadFileBytes) {
        file.contentOmitted = "too_large";
      } else if (embeddedBytes + bytes.byteLength > maxDownloadTotalBytes) {
        file.contentOmitted = "total_limit";
      } else {
        file.contentBase64 = bytes.toString("base64");
        embeddedBytes += bytes.byteLength;
      }
      collected.push(file);
    }
  }
  await walk(root);
  for (const inputPath of inputHashes.keys()) {
    if (visited.has(inputPath) || collected.length >= maxCollectedFiles)
      continue;
    collected.push({
      path: inputPath,
      size: 0,
      mimeType: mimeTypeForPath(inputPath),
      fromInput: true,
      modified: true,
      deleted: true,
    });
  }
  return collected;
}
