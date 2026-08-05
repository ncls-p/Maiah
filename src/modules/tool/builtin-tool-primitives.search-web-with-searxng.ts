import { randomInt } from "node:crypto";
import { z } from "zod";
import {
  base64ToolInputSchema,
  dateMathInputSchema,
  jsonToolInputSchema,
  randomNumberInputSchema,
  textStatsInputSchema,
  webSearchInputSchema,
} from "./builtin-tool-primitives.calculator-input-schema";
import {
  fetchSearxngResults,
  normalizeSearxngResults,
  summarizeSearchResults,
  todaySearchSuffix,
} from "./builtin-tool-primitives.calculate-expression";
import {
  NormalizedSearxngResult,
  slugifyTextInputSchema,
  unitConverterInputSchema,
  unitFactors,
} from "./builtin-tool-primitives.unit-converter-input-schema";

export async function searchWebWithSearxng(
  input: z.infer<typeof webSearchInputSchema>,
) {
  const { env } = await import("@/lib/env");
  const limit = input.limit ?? 5;
  const searchedQuery = `${input.query} ${todaySearchSuffix()}`.trim();
  const attemptedQueries = [searchedQuery, input.query];
  let lastError: string | null = null;
  let results: NormalizedSearxngResult[] = [];
  let successfulQuery = searchedQuery;

  for (const query of attemptedQueries) {
    const url = new URL("/search", env.SEARXNG_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("safesearch", "1");
    if (input.language) url.searchParams.set("language", input.language);

    try {
      const rawResults = await fetchSearxngResults(url);
      results = normalizeSearxngResults(rawResults, limit);
      successfulQuery = query;
      if (results.length > 0) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    ok: results.length > 0,
    query: input.query,
    fetchedAt: new Date().toISOString(),
    searchedQuery,
    successfulQuery,
    resultCount: results.length,
    error: results.length === 0 ? lastError : null,
    summary: summarizeSearchResults(results),
    results,
  };
}

export function randomNumbers({
  min,
  max,
  count,
  integer,
}: z.infer<typeof randomNumberInputSchema>) {
  if (max <= min) throw new Error("max must be greater than min");
  const values = Array.from({ length: count }, () => {
    if (!integer) return min + Math.random() * (max - min);
    const safeMin = Math.ceil(min);
    const safeMax = Math.floor(max);
    if (safeMax < safeMin) throw new Error("No integer exists in this range");
    return randomInt(safeMin, safeMax + 1);
  });
  return { values, value: values[0] };
}

function parseDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function mutateDate(date: Date, amount: number, unit: string) {
  const next = new Date(date);
  if (unit === "days") next.setUTCDate(next.getUTCDate() + amount);
  if (unit === "weeks") next.setUTCDate(next.getUTCDate() + amount * 7);
  if (unit === "months") next.setUTCMonth(next.getUTCMonth() + amount);
  if (unit === "years") next.setUTCFullYear(next.getUTCFullYear() + amount);
  return next;
}

export function dateMath(input: z.infer<typeof dateMathInputSchema>) {
  const date = parseDate(input.date);
  if (input.operation === "difference") {
    if (!input.endDate) throw new Error("endDate is required for difference");
    const endDate = parseDate(input.endDate);
    const milliseconds = endDate.getTime() - date.getTime();
    return {
      startDate: date.toISOString(),
      endDate: endDate.toISOString(),
      milliseconds,
      days: milliseconds / 86_400_000,
    };
  }
  const amount = input.operation === "subtract" ? -input.amount : input.amount;
  const result = mutateDate(date, amount, input.unit);
  return { inputDate: date.toISOString(), result: result.toISOString() };
}

export function jsonTool({
  action,
  json,
}: z.infer<typeof jsonToolInputSchema>) {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (action === "validate") return { valid: true };
    if (action === "minify") return { result: JSON.stringify(parsed) };
    if (action === "inspect") {
      return {
        valid: true,
        type: Array.isArray(parsed) ? "array" : typeof parsed,
        keys:
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? Object.keys(parsed as Record<string, unknown>)
            : [],
        items: Array.isArray(parsed) ? parsed.length : undefined,
      };
    }
    return { result: JSON.stringify(parsed, null, 2) };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function textStats({
  text,
  wordsPerMinute,
}: z.infer<typeof textStatsInputSchema>) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return {
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, "").length,
    words,
    lines: text.length ? text.split(/\r?\n/).length : 0,
    paragraphs: text.trim() ? text.trim().split(/\n\s*\n/).length : 0,
    readingTimeMinutes: Math.max(1, Math.ceil(words / wordsPerMinute)),
  };
}

export function base64Tool({
  action,
  value,
}: z.infer<typeof base64ToolInputSchema>) {
  if (action === "encode") {
    return { result: Buffer.from(value, "utf8").toString("base64") };
  }
  return { result: Buffer.from(value, "base64").toString("utf8") };
}

function convertTemperature(value: number, from: string, to: string) {
  const celsius =
    from === "c"
      ? value
      : from === "f"
        ? (value - 32) * (5 / 9)
        : value - 273.15;
  if (to === "c") return celsius;
  if (to === "f") return celsius * (9 / 5) + 32;
  return celsius + 273.15;
}

export function unitConverter({
  value,
  from,
  to,
}: z.infer<typeof unitConverterInputSchema>) {
  const fromUnit = unitFactors[from];
  const toUnit = unitFactors[to];
  if (fromUnit.kind !== toUnit.kind) {
    throw new Error(`Cannot convert ${from} to ${to}`);
  }
  const result =
    fromUnit.kind === "temperature"
      ? convertTemperature(value, from, to)
      : (value * fromUnit.factor) / toUnit.factor;
  return { value, from, to, result };
}

function trimSlugSeparator(value: string, separator: "-" | "_") {
  let start = 0;
  let end = value.length;
  while (value[start] === separator) start += 1;
  while (end > start && value[end - 1] === separator) end -= 1;
  return value.slice(start, end);
}

export function slugifyText({
  text,
  separator,
}: z.infer<typeof slugifyTextInputSchema>) {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, separator);
  return { slug: trimSlugSeparator(slug, separator) };
}
