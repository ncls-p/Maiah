

export function extractTitle(value: string) {
  const match = /"?title"?\s*[:=]\s*["“”']([^"“”'\n]+)/i.exec(value);
  return match?.[1]?.trim() ?? "";
}

export function extractSuggestions(value: string) {
  const parsedLines = value
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^title\s*[:=]/i.test(line))
    .filter((line) => !/^suggestions?\s*[:=]\s*\[?\s*$/i.test(line));
  return parsedLines.slice(0, 3);
}

export function sanitizeTitle(value: string, fallback: string) {
  const title = value
    .replace(/^```(?:json|text)?/i, "")
    .replace(/```$/i, "")
    .replace(/^['\"]|['\"]$/g, "")
    .replace(/[.。!?！？]+$/g, "")
    .trim();
  return (title || fallback).slice(0, 100);
}

export function createFallbackArtifacts(input: {
  userMessage: string;
  assistantText: string;
  fallbackTitle: string;
}) {
  const french = looksFrench(`${input.userMessage}\n${input.assistantText}`);
  return {
    title:
      buildLocalTitle(input.userMessage) ||
      sanitizeTitle(
        input.fallbackTitle,
        french ? "Nouvelle discussion" : "New chat",
      ),
    suggestions: french
      ? [
          "Peux-tu détailler les étapes ?",
          "Propose un cas pratique",
          "Quelles sont les alternatives ?",
        ]
      : [
          "Can you break that into steps?",
          "Show me a concrete example",
          "What are the alternatives?",
        ],
  };
}

function buildLocalTitle(value: string) {
  const words = value
    .replace(/[\r\n]+/g, " ")
    .replace(/[`*_#>\[\]{}()]/g, " ")
    .replace(/[.。!?！？,;:]+$/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7);
  return words.join(" ").slice(0, 100);
}

const FRENCH_LANGUAGE_SIGNAL =
  /[àâçéèêëîïôùûüÿœæ]|\b(le|la|les|un|une|des|du|de|ce|cette|ces|pour|avec|sans|est|sont|peux|peut|comment|quoi|quel|quelle)\b/i;

function looksFrench(value: string) {
  const candidate = value.trim();
  return FRENCH_LANGUAGE_SIGNAL.test(candidate);
}

export function ensureThreeSuggestions(values: unknown[], fallback: string[]) {
  const suggestions = sanitizeSuggestions(values);
  for (const suggestion of fallback) {
    if (suggestions.length >= 3) break;
    if (!suggestions.includes(suggestion)) suggestions.push(suggestion);
  }
  return suggestions.slice(0, 3);
}

function looksLikeArtifactSuggestion(value: string) {
  return !/^(?:input|constraint|task|goal|format|json schema|context|required shape)\b/i.test(
    value.trim(),
  );
}

function sanitizeSuggestions(values: unknown[]) {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.replace(/^['\"]|['\"]$/g, "").trim())
    .filter(Boolean)
    .filter(looksLikeArtifactSuggestion)
    .map((value) => value.slice(0, 80))
    .slice(0, 3);
}
