#!/usr/bin/env node
import path from "node:path";

export const socketPath =
	process.env.SANDBOX_RUNNER_SOCKET ?? "/run/sandbox/sandbox.sock";
export const runRoot = process.env.SANDBOX_RUN_ROOT ?? "/sandbox-runs";
export const pythonCommand =
	process.env.SANDBOX_PYTHON_COMMAND?.trim() || "python3";
export const sandboxUid = Number(process.env.SANDBOX_RUN_UID ?? "10001");
export const sandboxGid = Number(process.env.SANDBOX_RUN_GID ?? "10001");
export const socketGid = Number(process.env.SANDBOX_SOCKET_GID ?? "1001");
export const canSwitchUser =
	typeof process.getuid === "function" && process.getuid() === 0;
export const maxRequestBytes = Number(
	process.env.SANDBOX_MAX_REQUEST_BYTES ?? 8_000_000,
);
export const maxCodeChars = Number(process.env.SANDBOX_MAX_CODE_CHARS ?? 100_000);
export const maxInputFileChars = Number(
	process.env.SANDBOX_MAX_INPUT_FILE_CHARS ?? 200_000,
);
export const maxInputFileBytes = Number(
	process.env.SANDBOX_MAX_INPUT_FILE_BYTES ?? 1_500_000,
);
export const maxInputTotalBytes = Number(
	process.env.SANDBOX_MAX_INPUT_TOTAL_BYTES ?? 5_000_000,
);
export const maxInputFiles = Number(process.env.SANDBOX_MAX_INPUT_FILES ?? 40);
export const maxInlineStdinChars = Number(
	process.env.SANDBOX_MAX_INLINE_STDIN_CHARS ?? 100_000,
);
export const maxStdoutBytes = Number(process.env.SANDBOX_MAX_STDOUT_BYTES ?? 64_000);
export const maxStdoutFileBytes = Number(
	process.env.SANDBOX_MAX_STDOUT_FILE_BYTES ?? 1_500_000,
);
export const maxStderrBytes = Number(process.env.SANDBOX_MAX_STDERR_BYTES ?? 64_000);
export const maxFilePreviewBytes = Number(
	process.env.SANDBOX_MAX_FILE_PREVIEW_BYTES ?? 16_000,
);
export const maxCollectedFiles = Number(process.env.SANDBOX_MAX_COLLECTED_FILES ?? 30);
export const maxCollectedFileBytes = Number(
	process.env.SANDBOX_MAX_COLLECTED_FILE_BYTES ?? 1_000_000,
);
export const maxDownloadFileBytes = Number(
	process.env.SANDBOX_MAX_DOWNLOAD_FILE_BYTES ?? 1_000_000,
);
export const maxDownloadTotalBytes = Number(
	process.env.SANDBOX_MAX_DOWNLOAD_TOTAL_BYTES ?? 5_000_000,
);
const defaultTimeoutMs = Number(
	process.env.SANDBOX_DEFAULT_TIMEOUT_MS ?? 15_000,
);
const maxTimeoutMs = Number(process.env.SANDBOX_MAX_TIMEOUT_MS ?? 120_000);
export const maxProcesses = Number(process.env.SANDBOX_MAX_PROCESSES ?? 256);
export const maxOutputFileSizeBytes = Number(
	process.env.SANDBOX_MAX_OUTPUT_FILE_SIZE_BYTES ?? 10_000_000,
);
export const maxCpuSeconds = Number(process.env.SANDBOX_MAX_CPU_SECONDS ?? 120);
export const canUsePrlimit = process.platform === "linux";

export function log(level, message, data = {}) {
	const payload = {
		ts: new Date().toISOString(),
		lvl: level,
		msg: message,
		...data,
	};
	const line = `${JSON.stringify(payload)}\n`;
	if (level === "error" || level === "warn") {
		process.stderr.write(line);
		return;
	}
	process.stdout.write(line);
}

export const textExtensions = new Set([
	".c",
	".conf",
	".cpp",
	".cs",
	".css",
	".csv",
	".go",
	".html",
	".java",
	".js",
	".json",
	".jsx",
	".log",
	".md",
	".mjs",
	".py",
	".rb",
	".rs",
	".sh",
	".sql",
	".svg",
	".toml",
	".ts",
	".tsx",
	".txt",
	".xml",
	".yaml",
	".yml",
]);

export function jsonResponse(response, statusCode, payload) {
	const body = JSON.stringify(payload);
	response.writeHead(statusCode, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(body),
		"X-Content-Type-Options": "nosniff",
	});
	response.end(body);
}

export function clampTimeout(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return defaultTimeoutMs;
	}
	return Math.max(250, Math.min(maxTimeoutMs, Math.floor(value)));
}

export function safeRelativePath(rawPath) {
	if (typeof rawPath !== "string") {
		throw new Error("File path must be a string.");
	}
	const trimmed = rawPath.trim().replace(/\\/g, "/");
	if (!trimmed || trimmed.includes("\0")) throw new Error("Invalid file path.");
	if (trimmed.startsWith("/") || /^[a-zA-Z]:\//.test(trimmed)) {
		throw new Error("Absolute file paths are not allowed.");
	}
	const normalized = path.posix.normalize(trimmed).replace(/^\.\//, "");
	if (
		!normalized ||
		normalized === "." ||
		normalized === ".." ||
		normalized.startsWith("../") ||
		normalized.includes("/../")
	) {
		throw new Error("Path traversal is not allowed.");
	}
	if (normalized.length > 260 || normalized.split("/").length > 16) {
		throw new Error("File path is too long or too deep.");
	}
	const [firstSegment] = normalized.split("/");
	if (
		normalized === "main.py" ||
		normalized === "main.mjs" ||
		normalized === "main.sh" ||
		normalized === "package.json" ||
		normalized === ".stdin" ||
		normalized === ".stdout" ||
		firstSegment === "node_modules" ||
		firstSegment === "home" ||
		firstSegment === "tmp"
	) {
		throw new Error("Reserved sandbox file path.");
	}
	return normalized;
}

export function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function bytesFromBase64(value, filePath) {
	const normalized = value.replace(/\s/g, "");
	if (
		normalized.length % 4 !== 0 ||
		!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
	) {
		throw new Error(`Input file is not valid base64: ${filePath}`);
	}
	return Buffer.from(normalized, "base64");
}
