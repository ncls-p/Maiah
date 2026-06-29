import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
	canAttemptGitHubRepositoryPublish,
	describeGitHubRepositoryAccess,
	describeGitHubRepositoryRelationship,
	normalizeGitHubPrivateKey,
} from "@/modules/github/publishing";

function privateKeyPem() {
	return generateKeyPairSync("rsa", { modulusLength: 2048 })
		.privateKey.export({ format: "pem", type: "pkcs1" })
		.toString();
}

describe("GitHub publishing", () => {
	it("normalizes escaped and quoted GitHub App private keys", () => {
		const pem = privateKeyPem();
		const escaped = `"${pem.replace(/\n/g, "\\n")}"`;
		const normalized = normalizeGitHubPrivateKey(escaped);

		expect(normalized).toContain("-----BEGIN RSA PRIVATE KEY-----");
		expect(() => createPrivateKey(normalized)).not.toThrow();
	});

	it("normalizes base64 encoded PEM private keys", () => {
		const pem = privateKeyPem();
		const normalized = normalizeGitHubPrivateKey(
			Buffer.from(pem, "utf8").toString("base64"),
		);

		expect(normalized).toContain("-----BEGIN RSA PRIVATE KEY-----");
		expect(() => createPrivateKey(normalized)).not.toThrow();
	});

	it("normalizes copied env assignment lines and trailing shell prompts", () => {
		const pem = privateKeyPem();
		const normalizedPem = normalizeGitHubPrivateKey(
			`GITHUB_APP_PRIVATE_KEY=${pem.replace(/\n/g, "\\n")}%`,
		);
		const normalizedBase64 = normalizeGitHubPrivateKey(
			`export GITHUB_APP_PRIVATE_KEY=${Buffer.from(pem, "utf8").toString("base64")}%`,
		);

		expect(() => createPrivateKey(normalizedPem)).not.toThrow();
		expect(() => createPrivateKey(normalizedBase64)).not.toThrow();
	});

	it("describes repository access from GitHub App permissions", () => {
		expect(describeGitHubRepositoryAccess({ admin: true })).toBe("admin");
		expect(describeGitHubRepositoryAccess({ maintain: true })).toBe("maintain");
		expect(describeGitHubRepositoryAccess({ push: true })).toBe("write");
		expect(describeGitHubRepositoryAccess({ triage: true })).toBe("triage");
		expect(describeGitHubRepositoryAccess({ pull: true })).toBe("read");
		expect(describeGitHubRepositoryAccess(null)).toBe("unknown");
	});

	it("allows publishing attempts when GitHub App repository permissions are not exposed", () => {
		expect(canAttemptGitHubRepositoryPublish(null)).toBe(true);
		expect(canAttemptGitHubRepositoryPublish({ push: true })).toBe(true);
		expect(canAttemptGitHubRepositoryPublish({ pull: true })).toBe(false);
		expect(canAttemptGitHubRepositoryPublish({ triage: true })).toBe(false);
	});

	it("labels repositories outside the installation account as collaborator repositories", () => {
		expect(
			describeGitHubRepositoryRelationship({
				accountLogin: "octocat",
				owner: "OctoCat",
			}),
		).toBe("account");
		expect(
			describeGitHubRepositoryRelationship({
				accountLogin: "octocat",
				owner: "friend-org",
			}),
		).toBe("collaborator");
	});
});
