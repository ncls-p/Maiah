import { z } from "zod";

export const visualRegionsSchema = z.object({
  regions: z.array(
    z.object({
      kind: z.enum(["text", "diagram", "table", "image-description"]),
      text: z.string(),
      description: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedKind(value: unknown) {
  const kind = typeof value === "string" ? value.toLowerCase() : "text";
  if (kind.includes("diagram") || kind.includes("chart")) return "diagram";
  if (kind.includes("table")) return "table";
  if (kind.includes("image") || kind.includes("figure")) {
    return "image-description";
  }
  return "text";
}

function stringValue(...values: unknown[]) {
  return (
    values.find((value): value is string => typeof value === "string") ?? ""
  );
}

function normalizeRegion(value: unknown) {
  if (!isRecord(value)) return value;
  const confidence = numberValue(
    value.confidence ?? value.score ?? value.probability,
  );
  return {
    kind: normalizedKind(value.kind ?? value.type ?? value.category),
    text: stringValue(
      value.text,
      value.content,
      value.extractedText,
      value.extracted_text,
      value.value,
    ),
    description: stringValue(value.description, value.caption, value.summary),
    confidence:
      confidence === null
        ? 0.8
        : confidence > 1
          ? confidence / 100
          : confidence,
  };
}

export function parseVisualRegionsJson(value: string) {
  const withoutFence = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  const json =
    start >= 0 && end >= start
      ? withoutFence.slice(start, end + 1)
      : withoutFence;
  const parsed: unknown = JSON.parse(json);
  const strict = visualRegionsSchema.safeParse(parsed);
  if (strict.success) return { regions: strict.data.regions, regionKeys: [] };
  const rawRegions =
    isRecord(parsed) && Array.isArray(parsed.regions) ? parsed.regions : [];
  const regionKeys = [
    ...new Set(
      rawRegions.flatMap((region) =>
        isRecord(region) ? Object.keys(region) : [],
      ),
    ),
  ].sort();
  const normalized = visualRegionsSchema.parse({
    regions: rawRegions.map(normalizeRegion),
  });
  return { regions: normalized.regions, regionKeys };
}
