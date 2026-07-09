const REDACTED_VALUE = "[REDACTED]";
const TRUNCATED_VALUE = "[TRUNCATED]";

const DEFAULT_LIMITS = {
	maxArrayItems: 20,
	maxDepth: 5,
	maxObjectKeys: 40,
	maxStringLength: 500,
} as const;

type ProjectionLimits = Partial<{
	maxArrayItems: number;
	maxDepth: number;
	maxObjectKeys: number;
	maxStringLength: number;
}>;

function normalizedKey(key: string) {
	return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSecretKey(key: string) {
	const normalized = normalizedKey(key);
	return (
		[
			"authorization",
			"cookie",
			"cookies",
			"credential",
			"credentials",
			"password",
			"passwd",
			"sig",
			"signature",
			"secret",
			"token",
		].includes(normalized) ||
		normalized.endsWith("apikey") ||
		normalized.endsWith("accesstoken") ||
		normalized.endsWith("refreshtoken") ||
		normalized.endsWith("idtoken") ||
		normalized.endsWith("clientsecret") ||
		normalized.endsWith("privatekey") ||
		normalized.endsWith("signingkey") ||
		normalized.endsWith("webhooksecret") ||
		normalized.endsWith("connectionstring")
	);
}

function isEnvironmentContainer(key: string | undefined) {
	if (!key) return false;
	const normalized = normalizedKey(key);
	return normalized === "env" || normalized === "environment";
}

function isObviouslySecretString(value: string) {
	const trimmed = value.trim();
	return (
		/^bearer\s+\S+/i.test(trimmed) ||
		/^basic\s+\S+/i.test(trimmed) ||
		/^-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(trimmed) ||
		/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)
	);
}

function projectUrl(value: string) {
	if (/^data:/i.test(value)) return "[DATA URL OMITTED]";
	if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;

	try {
		const url = new URL(value);
		if (url.username) url.username = REDACTED_VALUE;
		if (url.password) url.password = REDACTED_VALUE;
		for (const key of [...url.searchParams.keys()]) {
			if (isSecretKey(key)) url.searchParams.set(key, REDACTED_VALUE);
		}
		return url.toString();
	} catch {
		return value;
	}
}

function projectString(value: string, maxLength: number) {
	if (isObviouslySecretString(value)) return REDACTED_VALUE;
	const safeValue = projectUrl(value);
	if (safeValue.length <= maxLength) return safeValue;
	return `${safeValue.slice(0, maxLength)}… ${TRUNCATED_VALUE}`;
}

/**
 * Produces the bounded, secret-aware representation that may cross a UI or
 * telemetry boundary. The encrypted invocation payload remains the execution
 * source of truth; this projection must never be used to run a tool.
 */
export function projectToolPayloadForDisplay(
	value: unknown,
	limits: ProjectionLimits = {},
) {
	const resolvedLimits = { ...DEFAULT_LIMITS, ...limits };
	const seen = new WeakSet<object>();

	function visit(
		current: unknown,
		depth: number,
		parentKey?: string,
	): unknown {
		if (current === null || current === undefined) return current ?? null;
		if (typeof current === "string") {
			return projectString(current, resolvedLimits.maxStringLength);
		}
		if (typeof current === "number" || typeof current === "boolean") {
			return current;
		}
		if (typeof current === "bigint") return current.toString();
		if (typeof current !== "object") return String(current);
		if (depth >= resolvedLimits.maxDepth) return TRUNCATED_VALUE;
		if (seen.has(current)) return "[CIRCULAR]";
		seen.add(current);

		if (Array.isArray(current)) {
			const projected = current
				.slice(0, resolvedLimits.maxArrayItems)
				.map((item) =>
					isEnvironmentContainer(parentKey)
						? REDACTED_VALUE
						: visit(item, depth + 1, parentKey),
				);
			if (current.length > resolvedLimits.maxArrayItems) {
				projected.push(TRUNCATED_VALUE);
			}
			return projected;
		}

		const output: Record<string, unknown> = {};
		const entries = Object.entries(current as Record<string, unknown>);
		for (const [key, child] of entries.slice(0, resolvedLimits.maxObjectKeys)) {
			output[key] =
				isSecretKey(key) || isEnvironmentContainer(parentKey)
					? REDACTED_VALUE
					: visit(child, depth + 1, key);
		}
		if (entries.length > resolvedLimits.maxObjectKeys) {
			output.__truncated__ = `${entries.length - resolvedLimits.maxObjectKeys} additional fields`;
		}
		return output;
	}

	return visit(value, 0);
}

export function safeToolErrorMessage(error: unknown, fallback: string) {
	const message = error instanceof Error ? error.message : fallback;
	const withSafeUrls = (message || fallback).replace(
		/https?:\/\/[^\s"'<>]+/gi,
		(url) => projectUrl(url),
	);
	const projected = projectString(withSafeUrls, 500);
	return projected === REDACTED_VALUE ? fallback : projected;
}

export { REDACTED_VALUE };
