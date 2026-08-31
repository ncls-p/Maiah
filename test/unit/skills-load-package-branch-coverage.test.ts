import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadSkillPackage,
  installSkillsFromCommand,
} from "@/modules/skills/use-cases.load-skill-package";
import {
  runSkillsCli,
  verifySkillInstallPreviewToken,
} from "@/modules/skills/use-cases.create-skill-install-preview-token";
import * as _preview from "@/modules/skills/use-cases.create-skill-install-preview-token";
import { checksumSkillPreview } from "@/modules/skills/use-cases.parse-skills-install-command";
import { SkillPreviewConflictError } from "@/modules/skills/use-cases.exec-file-async";
import * as _db from "@/server/infrastructure/db";

vi.mock("@/lib/logger", () => ({ logHandledError: vi.fn() }));
vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/server/infrastructure/db", () => {
  const values = vi.fn();
  const insert = vi.fn(() => ({ values, returning: vi.fn() }));
  return {
    db: {
      insert,
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ insert }),
      ),
    },
    _insert: insert,
    _values: values,
  };
});
vi.mock(
  "@/modules/skills/use-cases.create-skill-install-preview-token",
  async (importOriginal) => {
    const actual = await importOriginal<typeof _preview>();
    return {
      ...actual,
      runSkillsCli: vi.fn(),
      verifySkillInstallPreviewToken: vi.fn(),
      walkFiles: vi.fn(actual.walkFiles),
    };
  },
);

const dbMock = _db as unknown as {
  _insert: ReturnType<typeof vi.fn>;
  _values: ReturnType<typeof vi.fn>;
};

type SkillFixture = Record<string, Record<string, string>>;

function installFixture(fixture: SkillFixture) {
  vi.mocked(runSkillsCli).mockImplementation(
    async (_args: string[], tempDir: string) => {
      for (const [dir, files] of Object.entries(fixture)) {
        const skillDir = path.join(tempDir, ".claude", "skills", dir);
        await mkdir(skillDir, { recursive: true });
        for (const [name, content] of Object.entries(files)) {
          await writeFile(path.join(skillDir, name), content);
        }
      }
      return { stdout: "installed ok", stderr: "" };
    },
  );
}

const command = "npx skills add acme/skills --skill alpha";

beforeEach(() => {
  vi.clearAllMocks();
  dbMock._values.mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: "skill-1" }]),
  });
});

describe("loadSkillPackage branch coverage", () => {
  it("throws when the cli produces no skill directory", async () => {
    vi.mocked(runSkillsCli).mockResolvedValue({ stdout: "", stderr: "" });
    await expect(loadSkillPackage(command, "ai-hub-test-")).rejects.toThrow(
      "did not produce any skill directory",
    );
  });

  it("loads skills with frontmatter and fallback naming", async () => {
    installFixture({
      alpha: {
        "SKILL.md":
          "---\nname: Alpha Skill\ndescription: Does alpha things\n---\nbody",
        "notes.md": "notes",
      },
      beta: {
        "README.md": "no frontmatter here",
      },
      gamma: {
        "script.js": "console.log(1)",
      },
    });
    const loaded = await loadSkillPackage(command, "ai-hub-test-");
    expect(loaded.results.map((r) => r.name)).toEqual([
      "Alpha Skill",
      "beta",
    ]);
    const alpha = loaded.results[0];
    expect(alpha.description).toBe("Does alpha things");
    expect(alpha.markdownFiles.map((f) => f.path)).toEqual([
      "SKILL.md",
      "notes.md",
    ]);
    expect(loaded.results[1].description).toBeNull();
    expect(loaded.installOutput).toContain("installed ok");
  });

  it("throws when no markdown files exist at all", async () => {
    installFixture({ gamma: { "script.js": "console.log(1)" } });
    await expect(loadSkillPackage(command, "ai-hub-test-")).rejects.toThrow(
      "No Markdown files were found",
    );
  });

  it("skips oversized markdown files and stops at the total budget", async () => {
    const atLimit = "a".repeat(128_000);
    const overLimit = "b".repeat(128_001);
    installFixture({
      alpha: {
        "SKILL.md": "skill",
        "big.md": overLimit,
      },
    });
    const first = await loadSkillPackage(command, "ai-hub-test-");
    expect(first.results[0].markdownFiles.map((f) => f.path)).toEqual([
      "SKILL.md",
    ]);

    installFixture({
      alpha: {
        "a.md": atLimit,
        "b.md": atLimit,
        "c.md": atLimit,
      },
    });
    const second = await loadSkillPackage(command, "ai-hub-test-");
    expect(second.results[0].markdownFiles.map((f) => f.path)).toEqual([
      "a.md",
      "b.md",
    ]);
  });

  it("propagates walk failures from markdown extraction", async () => {
    const previewModule = await import(
      "@/modules/skills/use-cases.create-skill-install-preview-token"
    );
    vi.mocked(previewModule.walkFiles).mockRejectedValueOnce(
      new Error("walk boom"),
    );
    installFixture({ alpha: { "SKILL.md": "skill" } });
    await expect(loadSkillPackage(command, "ai-hub-test-")).rejects.toThrow(
      "walk boom",
    );
  });
});

describe("installSkillsFromCommand branch coverage", () => {
  it("installs skills and records isGlobal default and explicit values", async () => {
    installFixture({
      alpha: { "SKILL.md": "---\nname: Alpha\n---\nbody" },
    });
    const loaded = await loadSkillPackage(command, "ai-hub-test-");
    vi.mocked(verifySkillInstallPreviewToken).mockReturnValue({
      contentChecksum: checksumSkillPreview(loaded.results),
    } as never);

    const created = await installSkillsFromCommand({
      workspaceId: "ws-1",
      userId: "user-1",
      installCommand: command,
      previewToken: "token",
    });
    expect(created).toEqual([{ id: "skill-1" }]);
    const values = dbMock._values.mock.calls[0][0] as Record<string, unknown>;
    expect(values.isGlobal).toBe(false);
    expect(values.name).toBe("Alpha");

    dbMock._values.mockClear();
    await installSkillsFromCommand({
      workspaceId: "ws-1",
      userId: "user-1",
      installCommand: command,
      previewToken: "token",
      isGlobal: true,
    });
    const globalValues = dbMock._values.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(globalValues.isGlobal).toBe(true);
  });

  it("throws a preview conflict when the checksum changes", async () => {
    installFixture({
      alpha: { "SKILL.md": "---\nname: Alpha\n---\nbody" },
    });
    vi.mocked(verifySkillInstallPreviewToken).mockReturnValue({
      contentChecksum: "stale-checksum",
    } as never);
    await expect(
      installSkillsFromCommand({
        workspaceId: "ws-1",
        userId: "user-1",
        installCommand: command,
        previewToken: "token",
      }),
    ).rejects.toBeInstanceOf(SkillPreviewConflictError);
  });

  it("logs and rethrows installation failures", async () => {
    vi.mocked(runSkillsCli).mockRejectedValue(new Error("cli exploded"));
    vi.mocked(verifySkillInstallPreviewToken).mockReturnValue({
      contentChecksum: "x",
    } as never);
    await expect(
      installSkillsFromCommand({
        workspaceId: "ws-1",
        userId: "user-1",
        installCommand: command,
        previewToken: "token",
      }),
    ).rejects.toThrow("cli exploded");
  });
});