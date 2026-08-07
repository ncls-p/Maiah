import { fetchJson,fetchPendingToolCount,fetchWorkspacePermissions,fetchWorkspaces } from "@/lib/api-client";
import type { Mock } from "vitest";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";

describe("api-client", () => {
  const mockFetch = vi.fn() as Mock;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchWorkspaces", () => {
    it("returns workspace summaries", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            workspace: { id: "1", name: "WS1", slug: "ws1" },
            organization: {
              id: "org-1",
              name: "Org1",
              logoUrl: "data:image/png;base64,logo",
              theme: "forest",
            },
          },
          {
            workspace: { id: "2", name: "WS2", slug: "ws2" },
            organization: { name: "Org2" },
          },
        ],
      });

      const result = await fetchWorkspaces();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "1",
        name: "WS1",
        slug: "ws1",
        organizationId: "org-1",
        organizationName: "Org1",
        organizationLogoUrl: "data:image/png;base64,logo",
        organizationTheme: "forest",
        organizationThemeConfig: null,
        organizationHeroConfig: null,
      });
    });

    it("returns empty array on non-ok response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
      });

      const result = await fetchWorkspaces();
      expect(result).toEqual([]);
    });

    it("returns empty array on non-array response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => "not an array",
      });

      const result = await fetchWorkspaces();
      expect(result).toEqual([]);
    });

    it("filters out rows without workspace id", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            workspace: { id: "1", name: "WS1", slug: "ws1" },
            organization: { name: "Org1" },
          },
          { workspace: { name: "NoId" }, organization: { name: "Org2" } },
        ],
      });

      const result = await fetchWorkspaces();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("uses defaults for missing fields", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [{ workspace: { id: "1" }, organization: {} }],
      });

      const result = await fetchWorkspaces();
      expect(result[0]).toEqual({
        id: "1",
        name: "Workspace",
        slug: "main",
        organizationId: "",
        organizationName: "Organization",
        organizationLogoUrl: null,
        organizationTheme: "ocean",
        organizationThemeConfig: null,
        organizationHeroConfig: null,
      });
    });

    it("returns empty array on fetch error", async () => {
      mockFetch.mockRejectedValue(new Error("network error"));

      const result = await fetchWorkspaces();
      expect(result).toEqual([]);
    });
  });

  describe("fetchJson", () => {
    it("returns parsed JSON", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: "test" }),
      });

      const result = await fetchJson("/api/test");
      expect(result).toEqual({ data: "test" });
    });

    it("throws on non-ok response with error message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Not found" }),
      });

      await expect(fetchJson("/api/test")).rejects.toThrow("Not found");
    });

    it("throws on non-ok response with status code", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchJson("/api/test")).rejects.toThrow("Request failed: 500");
    });

    it("accepts request init", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });

      await fetchJson("/api/test", { method: "POST" });
      expect(mockFetch).toHaveBeenCalledWith("/api/test", {
        method: "POST",
      });
    });
  });

  describe("fetchPendingToolCount", () => {
    it("returns array length", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [{ id: "1" }, { id: "2" }, { id: "3" }],
      });

      const result = await fetchPendingToolCount("ws-1");
      expect(result).toBe(3);
    });

    it("returns 0 on non-ok response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
      });

      const result = await fetchPendingToolCount("ws-1");
      expect(result).toBe(0);
    });

    it("returns 0 on non-array response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => "not an array",
      });

      const result = await fetchPendingToolCount("ws-1");
      expect(result).toBe(0);
    });
  });

  describe("fetchWorkspacePermissions", () => {
    it("delegates to fetchJson", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ canManage: true }),
      });

      const result = await fetchWorkspacePermissions("ws-1");
      expect(result).toEqual({ canManage: true });
      expect(mockFetch).toHaveBeenCalledWith("/api/workspace/permissions?workspaceId=ws-1", undefined);
    });
  });
});
