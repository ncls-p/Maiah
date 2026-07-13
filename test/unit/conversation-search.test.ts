import { describe, expect, it } from "vitest";

import {
  conversationSearchSnippet,
  conversationTextMatches,
  normalizeConversationSearchText,
} from "@/modules/chat/conversation-search";

describe("conversation search", () => {
  it("matches case, accents, and repeated whitespace consistently", () => {
    expect(normalizeConversationSearchText("  Équipe\n  Produit ")).toBe(
      "equipe produit",
    );
    expect(conversationTextMatches("Planification de l’Équipe", "EQUIPE")).toBe(
      true,
    );
  });

  it("does not treat an empty query as a match", () => {
    expect(conversationTextMatches("Conversation", "   ")).toBe(false);
  });

  it("builds a compact snippet around the matching message", () => {
    const snippet = conversationSearchSnippet(
      `Avant ${"contexte ".repeat(12)}migration PostgreSQL ${"après ".repeat(30)}`,
      "migration",
    );

    expect(snippet).toContain("migration PostgreSQL");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });
});
