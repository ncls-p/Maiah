import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  maintenance: vi.fn(),
  close: vi.fn(),
  create: vi.fn(),
  restore: vi.fn(),
  open: vi.fn(),
  seal: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  env: {
    BETTER_AUTH_URL: "https://maiah.test",
    APP_ENCRYPTION_KEY: "test-signing-key",
  },
}));
vi.mock("@/modules/admin/auth", () => ({ requireAdminApiSession: mocks.auth }));
vi.mock("@/modules/data-portability/runtime", () => ({
  assertPortabilityMaintenance: mocks.maintenance,
  connectRuntimePortability: () => ({ context: {}, close: mocks.close }),
}));
vi.mock("@/modules/data-portability/service", () => ({
  createSnapshot: mocks.create,
  restoreSnapshot: mocks.restore,
}));
vi.mock("@/modules/data-portability/archive", () => ({
  MAX_ARCHIVE_BYTES: 128 * 1024 * 1024,
  digest: () => "archive-digest",
  openSnapshot: mocks.open,
  sealSnapshot: mocks.seal,
}));
vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: mocks.audit },
}));
import { POST } from "@/app/api/admin/data-portability/route";

function request(
  action: string,
  options: {
    origin?: string;
    confirmation?: string;
    organizationId?: string;
  } = {},
) {
  const form = new FormData();
  form.set("action", action);
  form.set("passphrase", "long-enough-test-password");
  form.set("archive", new File(["encrypted-test"], "test.maiah"));
  if (options.confirmation) form.set("confirmation", options.confirmation);
  if (options.organizationId)
    form.set("organizationId", options.organizationId);
  return new Request("https://maiah.test/api/admin/data-portability", {
    method: "POST",
    headers: { origin: options.origin ?? "https://maiah.test" },
    body: form,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    ok: true,
    session: { user: { id: "admin" }, session: { id: "admin-session" } },
  });
  mocks.open.mockResolvedValue({ scope: { type: "instance" } });
  mocks.restore.mockResolvedValue({ rows: 12, objects: 3 });
  mocks.seal.mockResolvedValue(Buffer.from("encrypted"));
  mocks.audit.mockResolvedValue(undefined);
});
describe("data portability administrative boundary", () => {
  it.each([401, 403])(
    "rejects unauthorized requests (%s) before processing archives",
    async (status) => {
      mocks.auth.mockResolvedValue({
        ok: false,
        response: new Response(null, { status }),
      });
      expect((await POST(request("export"))).status).toBe(status);
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.maintenance).not.toHaveBeenCalled();
    },
  );
  it("rejects a foreign origin even for an administrator", async () => {
    expect(
      (await POST(request("export", { origin: "https://attacker.test" })))
        .status,
    ).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires maintenance acknowledgement", async () => {
    mocks.maintenance.mockRejectedValue(new Error("Maintenance required"));
    expect((await POST(request("export"))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("exports only the selected organization and returns a non-cacheable attachment", async () => {
    const organizationId = "10000000-0000-4000-8000-000000000001";
    const response = await POST(request("export", { organizationId }));
    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ authorize: expect.any(Function) }),
      { type: "organization", organizationId },
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });
  it("requires a successful preview tied to this administrator before writing", async () => {
    expect((await POST(request("import"))).status).toBe(409);
    expect(mocks.restore).not.toHaveBeenCalled();
    const preview = await (await POST(request("preview"))).json();
    expect(mocks.restore).toHaveBeenLastCalledWith(
      expect.objectContaining({ authorize: expect.any(Function) }),
      { scope: { type: "instance" } },
      true,
    );
    const imported = await POST(
      request("import", { confirmation: preview.confirmation }),
    );
    expect(imported.status).toBe(200);
    expect(mocks.restore).toHaveBeenLastCalledWith(
      expect.objectContaining({ authorize: expect.any(Function) }),
      { scope: { type: "instance" } },
      false,
    );
    mocks.auth.mockResolvedValue({
      ok: true,
      session: {
        user: { id: "other-admin" },
        session: { id: "other-session" },
      },
    });
    expect(
      (await POST(request("import", { confirmation: preview.confirmation })))
        .status,
    ).toBe(409);
  });
  it("does not allow instance imports from an organization panel", async () => {
    const response = await POST(
      request("preview", {
        organizationId: "10000000-0000-4000-8000-000000000001",
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.restore).not.toHaveBeenCalled();
  });
  it("does not leak database constraint details or credentials", async () => {
    mocks.restore.mockRejectedValue(
      Object.assign(new Error("secret-token-in-query"), { code: "23505" }),
    );
    const response = await POST(request("preview"));
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("secret-token-in-query");
  });
});
