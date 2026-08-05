#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	constants as fsConstants,
	createReadStream,
	createWriteStream,
} from "node:fs";
import {
	access,
	chmod,
	chown,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { canSwitchUser, jsonResponse, log, maxCollectedFileBytes, maxCollectedFiles, maxDownloadFileBytes, maxDownloadTotalBytes, maxFilePreviewBytes, maxStdoutFileBytes, runRoot, socketGid, socketPath } from "./sandbox-runner.socket-path";
import { executeProcess, isProbablyText, mimeTypeForPath, prepareRun } from "./sandbox-runner.prepare-run";
import { readJsonBody } from "./sandbox-runner.read-json-body";


async function collectFiles(root, inputHashes) {
	const collected = [];
	let embeddedBytes = 0;
	async function walk(directory, prefix = "") {
		if (collected.length >= maxCollectedFiles) return;
		const entries = await readdir(directory, { withFileTypes: true }).catch(
			() => [],
		);
		for (const entry of entries) {
			if (collected.length >= maxCollectedFiles) return;
			if (
				entry.name === "node_modules" ||
				entry.name === "home" ||
				entry.name === "tmp"
			) {
				continue;
			}
			if (
				entry.name === "main.py" ||
				entry.name === "main.mjs" ||
				entry.name === "main.sh" ||
				entry.name === "package.json" ||
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
			if (bytes.byteLength > maxDownloadFileBytes) {
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
	return collected;
}

async function runSandbox(input) {
	const prepared = await prepareRun(input);
	try {
		const execution = await executeProcess(input, prepared.workdir);
		const completeStdout = execution.stdoutFileTruncated
			? execution.stdout
			: await readFile(path.join(prepared.workdir, ".stdout"), "utf8");
		const files = await collectFiles(prepared.workdir, prepared.inputHashes);
		return {
			ok:
				execution.exitCode === 0 &&
				!execution.timedOut &&
				!execution.stdoutFileTruncated,
			language: input.language,
			...execution,
			stdout: completeStdout,
			...(execution.stdoutFileTruncated
				? {
						error: `Sandbox standard output exceeded ${maxStdoutFileBytes} bytes.`,
					}
				: {}),
			files,
		};
	} finally {
		await rm(prepared.workdir, { recursive: true, force: true }).catch(
			() => undefined,
		);
	}
}

async function start() {
	await mkdir(path.dirname(socketPath), { recursive: true });
	try {
		await access(socketPath, fsConstants.F_OK);
		await rm(socketPath, { force: true });
	} catch {
		// no stale socket
	}

	const server = createServer(async (request, response) => {
		if (request.method === "GET" && request.url === "/health") {
			jsonResponse(response, 200, { status: "ok" });
			return;
		}
		if (request.method !== "POST" || request.url !== "/run") {
			jsonResponse(response, 404, { error: "Not found" });
			return;
		}
		const executionId =
			request.headers["x-sandbox-execution-id"]?.toString() ?? randomUUID();
		const startedAt = Date.now();
		try {
			const input = await readJsonBody(request);
			log("info", "sandbox-runner execution started", {
				executionId,
				language: input.language,
				fileCount: input.files.length,
				timeoutMs: input.timeoutMs,
			});
			const result = await runSandbox(input);
			log("info", "sandbox-runner execution completed", {
				executionId,
				language: result.language,
				ok: result.ok,
				exitCode: result.exitCode,
				signal: result.signal,
				timedOut: result.timedOut,
				durationMs: result.durationMs,
				wallDurationMs: Date.now() - startedAt,
				stdoutBytes: Buffer.byteLength(result.stdout),
				stderrBytes: Buffer.byteLength(result.stderr),
				fileCount: result.files.length,
				truncated: result.truncated,
			});
			jsonResponse(response, 200, result);
		} catch (error) {
			log("warn", "sandbox-runner execution rejected", {
				executionId,
				durationMs: Date.now() - startedAt,
				error: error instanceof Error ? error.message : String(error),
			});
			jsonResponse(response, 400, {
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});

	server.listen(socketPath, async () => {
		if (canSwitchUser) {
			await chown(socketPath, 0, socketGid).catch(() => undefined);
			await chmod(socketPath, 0o660).catch(() => undefined);
		} else {
			await chmod(socketPath, 0o600).catch(() => undefined);
		}
		log("info", "sandbox-runner listening", { socketPath, runRoot });
	});

	for (const signal of ["SIGINT", "SIGTERM"]) {
		process.on(signal, () => {
			server.close(() => {
				rm(socketPath, { force: true }).finally(() => process.exit(0));
			});
		});
	}
}

start().catch((error) => {
	log("error", "sandbox-runner failed to start", {
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
	});
	process.exit(1);
});
