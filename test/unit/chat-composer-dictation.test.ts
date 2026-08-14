import { describe, expect, it } from "vitest";

import {
  appendDictationTranscript,
  collectFinalDictationTranscripts,
  dictationLocaleFromAppLocale,
} from "@/components/chat/chat-composer.dictation";

describe("composer dictation helpers", () => {
  it("appends transcripts without duplicating spaces", () => {
    expect(appendDictationTranscript("", "  hello ")).toBe("hello");
    expect(appendDictationTranscript("Hello", "there")).toBe("Hello there");
    expect(appendDictationTranscript("Hello ", "there")).toBe("Hello there");
  });

  it("maps the app locale to a speech recognition locale", () => {
    expect(dictationLocaleFromAppLocale("fr")).toBe("fr-FR");
    expect(dictationLocaleFromAppLocale("fr-FR")).toBe("fr-FR");
    expect(dictationLocaleFromAppLocale("en")).toBe("en-US");
  });

  it("keeps only final speech recognition results", () => {
    expect(
      collectFinalDictationTranscripts({
        resultIndex: 0,
        results: [
          { isFinal: false, 0: { transcript: "draft" } },
          { isFinal: true, 0: { transcript: " final " } },
        ],
      }),
    ).toEqual(["final"]);
  });
});
