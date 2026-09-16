import { beforeEach, describe, expect, it, vi } from "vitest";
const values = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/server/infrastructure/cache", () => ({
  cache: {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    incr: vi.fn(async (key: string) => {
      const value = Number(values.get(key) ?? 0) + 1;
      values.set(key, value);
      return value;
    }),
  },
}));
vi.mock("@/lib/crypto", () => ({
  encryptValue: async (value: string) => `encrypted:${value}`,
  decryptValue: async (value: string) => value.slice(10),
}));
import {
  pollPage,
  readPage,
  performUiAction,
  acknowledgeAction,
} from "@/modules/companion/bridge";
import type { PageContext } from "@/modules/companion/contracts";
const page: PageContext = {
  path: "/en/agents",
  title: "Assistants",
  headings: [],
  cursor: null,
  focus: null,
  elements: [
    {
      id: "name",
      tag: "input",
      label: "Name",
      role: "",
      disabled: false,
      value: "Original",
    },
  ],
};
beforeEach(() => values.clear());
describe("companion page bridge", () => {
  it("isolates context by user, project and tab and clears it when disabled", async () => {
    await pollPage("alice", "project", "tab", page);
    expect([...values.values()][0]).toMatch(/^encrypted:/);
    expect(await readPage("alice", "project", "tab")).toEqual(page);
    for (const scope of [
      ["bob", "project", "tab"],
      ["alice", "other", "tab"],
      ["alice", "project", "other"],
    ])
      await expect(
        readPage(...(scope as [string, string, string])),
      ).rejects.toThrow("unavailable");
    await pollPage("alice", "project", "tab", null);
    await expect(readPage("alice", "project", "tab")).rejects.toThrow(
      "unavailable",
    );
  });
  it("refuses stale pages and unknown or disabled controls", async () => {
    await pollPage("a", "p", "t", page);
    await expect(
      performUiAction("a", "p", "t", {
        action: "click",
        path: "/en/tools",
        target: "name",
      }),
    ).rejects.toThrow("Page changed");
    await expect(
      performUiAction("a", "p", "t", {
        action: "click",
        path: page.path,
        target: "missing",
      }),
    ).rejects.toThrow("unavailable");
  });
  it("claims commands once, waits for browser acknowledgement and removes them", async () => {
    await pollPage("a", "p", "t", page);
    const pending = performUiAction("a", "p", "t", {
      action: "fill",
      path: page.path,
      target: "name",
      value: "Edited",
    });
    await vi.waitFor(() =>
      expect([...values.keys()].some((key) => key.includes(":command:"))).toBe(
        true,
      ),
    );
    const commands = await pollPage("a", "p", "t", page);
    expect(commands).toHaveLength(1);
    expect(await pollPage("a", "p", "t", page)).toEqual([]);
    await acknowledgeAction("a", "p", "t", commands[0].id, { ok: true });
    await expect(pending).resolves.toEqual({ ok: true });
    expect(
      [...values.keys()].some(
        (key) => key.includes(":command:") || key.includes(":issued:"),
      ),
    ).toBe(false);
    await expect(
      acknowledgeAction("a", "p", "t", commands[0].id, { ok: true }),
    ).rejects.toThrow("expired");
  });
  it("cancels pending actions without leaving an executable command", async () => {
    await pollPage("a", "p", "t", page);
    const controller = new AbortController();
    controller.abort();
    await expect(
      performUiAction(
        "a",
        "p",
        "t",
        { action: "refresh", path: page.path },
        controller.signal,
      ),
    ).rejects.toThrow("cancelled");
    expect(await pollPage("a", "p", "t", page)).toEqual([]);
  });
});
