const SEARCH_SNIPPET_CONTEXT_BEFORE = 48;
const SEARCH_SNIPPET_CONTEXT_AFTER = 88;

export type ConversationSearchMatch = {
  kind: "title" | "message";
  snippet: string;
};

export function normalizeConversationSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function conversationTextMatches(value: string, query: string) {
  const normalizedQuery = normalizeConversationSearchText(query);
  return (
    normalizedQuery.length > 0 &&
    normalizeConversationSearchText(value).includes(normalizedQuery)
  );
}

export function conversationSearchSnippet(value: string, query: string) {
  const compactValue = value.replace(/\s+/g, " ").trim();
  const normalizedValue = normalizeConversationSearchText(compactValue);
  const normalizedQuery = normalizeConversationSearchText(query);
  const matchIndex = normalizedValue.indexOf(normalizedQuery);

  if (matchIndex < 0) return compactValue.slice(0, 140);

  let start = Math.max(0, matchIndex - SEARCH_SNIPPET_CONTEXT_BEFORE);
  let end = Math.min(
    compactValue.length,
    matchIndex + normalizedQuery.length + SEARCH_SNIPPET_CONTEXT_AFTER,
  );

  if (start > 0) {
    const nextSpace = compactValue.indexOf(" ", start);
    if (nextSpace >= 0 && nextSpace < matchIndex) start = nextSpace + 1;
  }
  if (end < compactValue.length) {
    const previousSpace = compactValue.lastIndexOf(" ", end);
    if (previousSpace > matchIndex) end = previousSpace;
  }

  return `${start > 0 ? "…" : ""}${compactValue.slice(start, end)}${
    end < compactValue.length ? "…" : ""
  }`;
}
