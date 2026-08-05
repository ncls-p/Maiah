import { randomInt } from "node:crypto";
import { z } from "zod";

export const unitConverterInputSchema = z.object({
  value: z.number(),
  from: z.enum([
    "mm",
    "cm",
    "m",
    "km",
    "in",
    "ft",
    "yd",
    "mi",
    "mg",
    "g",
    "kg",
    "oz",
    "lb",
    "b",
    "kb",
    "mb",
    "gb",
    "tb",
    "c",
    "f",
    "k",
  ]),
  to: z.enum([
    "mm",
    "cm",
    "m",
    "km",
    "in",
    "ft",
    "yd",
    "mi",
    "mg",
    "g",
    "kg",
    "oz",
    "lb",
    "b",
    "kb",
    "mb",
    "gb",
    "tb",
    "c",
    "f",
    "k",
  ]),
});

export const slugifyTextInputSchema = z.object({
  text: z.string().min(1).max(1_000),
  separator: z.enum(["-", "_"]).default("-"),
});

export const colorConverterInputSchema = z.object({
  hex: z
    .string()
    .trim()
    .regex(/^#?[0-9a-fA-F]{6}$/, "Use a 6-digit hex color"),
});

export const markdownTableInputSchema = z.object({
  columns: z.array(z.string().min(1).max(80)).min(1).max(12),
  rows: z.array(z.array(z.string().max(500)).max(12)).max(100),
});

export type SearxngResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  engine?: unknown;
  engines?: unknown;
  score?: unknown;
};

export type NormalizedSearxngResult = {
  title: string;
  url: string;
  snippet: string;
  score: number | null;
  engines: string[];
};

type UnitKind = "length" | "weight" | "data" | "temperature";

export const unitFactors: Record<string, { kind: UnitKind; factor: number }> = {
  mm: { kind: "length", factor: 0.001 },
  cm: { kind: "length", factor: 0.01 },
  m: { kind: "length", factor: 1 },
  km: { kind: "length", factor: 1_000 },
  in: { kind: "length", factor: 0.0254 },
  ft: { kind: "length", factor: 0.3048 },
  yd: { kind: "length", factor: 0.9144 },
  mi: { kind: "length", factor: 1_609.344 },
  mg: { kind: "weight", factor: 0.001 },
  g: { kind: "weight", factor: 1 },
  kg: { kind: "weight", factor: 1_000 },
  oz: { kind: "weight", factor: 28.349523125 },
  lb: { kind: "weight", factor: 453.59237 },
  b: { kind: "data", factor: 1 },
  kb: { kind: "data", factor: 1_024 },
  mb: { kind: "data", factor: 1_048_576 },
  gb: { kind: "data", factor: 1_073_741_824 },
  tb: { kind: "data", factor: 1_099_511_627_776 },
  c: { kind: "temperature", factor: 1 },
  f: { kind: "temperature", factor: 1 },
  k: { kind: "temperature", factor: 1 },
};

export class MathExprToken {
  type: "num" | "op" | "open" | "close" | "fn";
  value: string;
  constructor(type: MathExprToken["type"], value: string) {
    this.type = type;
    this.value = value;
  }
}

export class MathExprTokenizer {
  private pos = 0;
  private input: string;
  private tokens: MathExprToken[];

  constructor(input: string) {
    this.input = input.replace(/\s+/g, "");
    this.tokens = [];
  }

  peek(): string | undefined {
    return this.input[this.pos];
  }

  advance(): string | undefined {
    return this.input[this.pos++];
  }

  tokenize(): MathExprToken[] {
    while (this.pos < this.input.length) {
      const ch = this.peek();
      if (ch === "(") {
        this.tokens.push(new MathExprToken("open", "("));
        this.advance();
      } else if (ch === ")") {
        this.tokens.push(new MathExprToken("close", ")"));
        this.advance();
      } else if (ch && "+-*/^".includes(ch)) {
        this.tokens.push(new MathExprToken("op", ch));
        this.advance();
      } else if (
        ch &&
        (ch === "." || (ch.charCodeAt(0) >= 48 && ch.charCodeAt(0) <= 57))
      ) {
        let num = "";
        while (
          this.pos < this.input.length &&
          ((this.input[this.pos].charCodeAt(0) >= 48 &&
            this.input[this.pos].charCodeAt(0) <= 57) ||
            this.input[this.pos] === ".")
        ) {
          num += this.input[this.pos++];
        }
        this.tokens.push(new MathExprToken("num", num));
      } else {
        let id = "";
        while (
          this.pos < this.input.length &&
          this.input[this.pos].match(/[a-zA-Z_]/)
        ) {
          id += this.input[this.pos++];
        }
        const ch2 = this.peek();
        if (ch2 === "(") {
          this.tokens.push(new MathExprToken("fn", id));
        } else {
          throw new Error(`Unknown identifier: ${id}`);
        }
      }
    }
    return this.tokens;
  }
}
