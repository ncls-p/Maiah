import { describe, expect, it } from "vitest";
import {
  createErrorReport,
  formatErrorReport,
  redactErrorText,
} from "@/lib/error-report";
describe("shareable error diagnostics", () => {
  it("removes credentials, URL queries and fragments while preserving useful status", () => {
    const report = redactErrorText(
      'HTTP 403 https://user:password@example.com/v1/models?api_key=private#secret Authorization: Bearer sensitive {"secretAccessKey":"aws-secret","sessionToken":"aws-session"}',
    );
    expect(report).toContain("HTTP 403 https://example.com/v1/models");
    for (const secret of [
      "private",
      "sensitive",
      "aws-secret",
      "aws-session",
      "user:password",
    ])
      expect(report).not.toContain(secret);
  });
  it("includes a timestamp and server reference without a stack or request payload", () => {
    const report = createErrorReport("Unable to save", "request-123");
    expect(JSON.parse(formatErrorReport(report))).toMatchObject({
      message: "Unable to save",
      reference: "request-123",
    });
    expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false);
  });
});
