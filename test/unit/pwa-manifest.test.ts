import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

describe("PWA manifest", () => {
  it("describes an installable standalone application", () => {
    expect(manifest()).toMatchObject({
      name: "Maiah",
      short_name: "Maiah",
      start_url: "/",
      scope: "/",
      display: "standalone",
      icons: expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192" }),
        expect.objectContaining({ sizes: "512x512" }),
      ]),
    });
  });
});
