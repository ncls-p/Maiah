import { z } from "zod";
import { colorConverterInputSchema,markdownTableInputSchema } from "./builtin-tool-primitives.unit-converter-input-schema";

export function colorConverter({ hex }: z.infer<typeof colorConverterInputSchema>) {
  const normalized = hex.replace("#", "").toLowerCase();
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r1) hue = 60 * (((g1 - b1) / delta) % 6);
    if (max === g1) hue = 60 * ((b1 - r1) / delta + 2);
    if (max === b1) hue = 60 * ((r1 - g1) / delta + 4);
  }
  return {
    hex: `#${normalized}`,
    rgb: { r, g, b },
    hsl: {
      h: Math.round((hue + 360) % 360),
      s: Math.round(saturation * 100),
      l: Math.round(lightness * 100),
    },
  };
}

export function markdownTable({ columns, rows }: z.infer<typeof markdownTableInputSchema>) {
  const escapeCell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const normalizedRows = rows.map((row) => columns.map((_, index) => escapeCell(row[index] ?? "")));
  const header = `| ${columns.map(escapeCell).join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = normalizedRows.map((row) => `| ${row.join(" | ")} |`);
  return { markdown: [header, separator, ...body].join("\n") };
}
