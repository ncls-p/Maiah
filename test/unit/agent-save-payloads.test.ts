import { describe, expect, it } from "vitest";

import { buildEssentialPayload } from "@/app/[locale]/(workspace)/agents/[agentId]/page.agent-save-payloads";
import {
  createEmptyForm,
  type Agent,
} from "@/app/[locale]/(workspace)/agents/[agentId]/types";

describe("agent save payloads", () => {
  it("preserves explicit unlimited output and context values", () => {
    const form = createEmptyForm();
    form.maxOutputTokens = "0";
    form.memoryPolicy.contextWindowTokens = "0";

    const payload = buildEssentialPayload(
      form,
      {
        activeVersionId: null,
        sharingMode: "personal",
        canAdminCurate: false,
      } as Agent,
      new Set(),
    );

    expect(payload.maxOutputTokens).toBe(0);
    expect(payload.memoryPolicy.contextWindowTokens).toBe(0);
  });
});
