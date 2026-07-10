import { describe, expect, it } from "vitest";
import {
	projectToolPayloadForDisplay,
	REDACTED_VALUE,
	safeToolErrorMessage,
} from "@/modules/tool/safe-payload";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";

describe("tool payload display projection", () => {
	it("redacts nested credentials without hiding ordinary token limits", () => {
		expect(
			projectToolPayloadForDisplay({
				apiKey: "sk-secret",
				maxOutputTokens: 1_024,
				headers: {
					Authorization: "Bearer hidden",
					"Content-Type": "application/json",
				},
			}),
		).toEqual({
			apiKey: REDACTED_VALUE,
			maxOutputTokens: 1_024,
			headers: {
				Authorization: REDACTED_VALUE,
				"Content-Type": "application/json",
			},
		});
	});

	it("redacts environment values and sensitive URL parameters", () => {
		const projected = projectToolPayloadForDisplay({
			env: { REGION: "eu-west-1", TOKEN: "hidden" },
			url: "https://user:pass@example.com/run?query=safe&access_token=hidden",
		}) as {
			env: Record<string, unknown>;
			url: string;
		};

		expect(projected.env).toEqual({
			REGION: REDACTED_VALUE,
			TOKEN: REDACTED_VALUE,
		});
		const url = new URL(projected.url);
		expect(decodeURIComponent(url.username)).toBe(REDACTED_VALUE);
		expect(decodeURIComponent(url.password)).toBe(REDACTED_VALUE);
		expect(url.searchParams.get("query")).toBe("safe");
		expect(url.searchParams.get("access_token")).toBe(REDACTED_VALUE);
		expect(projectToolPayloadForDisplay({ env: ["TOKEN=hidden"] })).toEqual({
			env: [REDACTED_VALUE],
		});
	});

	it("bounds large and circular values", () => {
		const circular: Record<string, unknown> = {
			message: "x".repeat(40),
		};
		circular.self = circular;

		expect(
			projectToolPayloadForDisplay(circular, { maxStringLength: 10 }),
		).toEqual({
			message: "xxxxxxxxxx… [TRUNCATED]",
			self: "[CIRCULAR]",
		});
	});

	it("keeps approval summaries useful while redacting single secret fields", () => {
		expect(summarizeToolInput("Webhook", { apiKey: "hidden" })).toBe(
			`Webhook: apiKey = ${REDACTED_VALUE}`,
		);
		expect(
			summarizeToolInput("Fetch", {
				url: "https://example.com/path?token=hidden",
			}),
		).not.toContain("hidden");
		expect(
			projectToolPayloadForDisplay({
				message: "Request used Bearer hidden and access_token=also-hidden",
			}),
		).toEqual({
			message:
				"Request used Bearer [REDACTED] and access_token=[REDACTED]",
		});
	});

	it("does not expose an error that is itself a credential", () => {
		expect(
			safeToolErrorMessage(new Error("Bearer top-secret"), "Execution failed"),
		).toBe("Execution failed");
		expect(
			safeToolErrorMessage(
				new Error("Request failed at https://example.com?sig=hidden"),
				"Execution failed",
			),
		).not.toContain("hidden");
	});
});
