import {
MathExprToken,
MathExprTokenizer,
NormalizedSearxngResult,
SearxngResult,
} from "./builtin-tool-primitives.unit-converter-input-schema";

class MathExprParser {
  private pos = 0;
  private tokens: MathExprToken[];

  constructor(tokens: MathExprToken[]) {
    this.tokens = tokens;
  }

  private peek(): MathExprToken | undefined {
    return this.tokens[this.pos];
  }

  private advance(): MathExprToken | undefined {
    return this.tokens[this.pos++];
  }

  parse(): number {
    const result = this.parseAddSub();
    if (this.pos !== this.tokens.length) {
      throw new Error("Unexpected token after expression");
    }
    return result;
  }

  private parseAddSub(): number {
    let left = this.parseMulDiv();
    while (this.peek()?.value === "+" || this.peek()?.value === "-") {
      const op = this.advance()!.value;
      const right = this.parseMulDiv();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  private parseMulDiv(): number {
    let left = this.parseExponent();
    while (this.peek()?.value === "*" || this.peek()?.value === "/") {
      const op = this.advance()!.value;
      const right = this.parseExponent();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  private parseExponent(): number {
    const base = this.parseUnary();
    if (this.peek()?.value === "^") {
      this.advance();
      const exp = this.parseExponent();
      return Math.pow(base, exp);
    }
    return base;
  }

  private parseUnary(): number {
    const tok = this.peek();
    if (tok?.value === "-") {
      this.advance();
      return -this.parseUnary();
    }
    if (tok?.value === "+") {
      this.advance();
      return this.parseUnary();
    }
    return this.parseValue();
  }

  private parseValue(): number {
    const tok = this.peek();
    if (tok?.type === "num") {
      this.advance();
      return Number(tok.value);
    }
    if (tok?.value === "(") {
      this.advance();
      const val = this.parseAddSub();
      if (this.peek()?.value !== ")") {
        throw new Error("Missing closing parenthesis");
      }
      this.advance();
      return val;
    }
    if (tok?.type === "fn") {
      const fn = this.advance()!.value;
      if (this.peek()?.value !== "(") {
        throw new Error(`Expected ( after function ${fn}`);
      }
      this.advance();
      const arg = this.parseAddSub();
      if (this.peek()?.value !== ")") {
        throw new Error(`Missing ) for function ${fn}`);
      }
      this.advance();
      if (fn === "sin") return Math.sin(arg);
      if (fn === "cos") return Math.cos(arg);
      if (fn === "tan") return Math.tan(arg);
      if (fn === "sqrt") return Math.sqrt(arg);
      if (fn === "log") return Math.log(arg);
      if (fn === "abs") return Math.abs(arg);
      if (fn === "round") return Math.round(arg);
      if (fn === "floor") return Math.floor(arg);
      if (fn === "ceil") return Math.ceil(arg);
      throw new Error(`Unknown function: ${fn}`);
    }
    throw new Error(`Unexpected token: ${tok?.value ?? "end"}`);
  }
}

export function calculateExpression(expression: string): number {
  // Restricted by calculatorInputSchema to arithmetic-only characters.
  // Evaluated with a recursive descent parser — no eval/Function().
  const tokens = new MathExprTokenizer(expression).tokenize();
  const result = new MathExprParser(tokens).parse();
  if (!Number.isFinite(result)) {
    throw new Error("Expression did not evaluate to a finite number");
  }
  return result;
}

function normalizeSearxngEngines(result: SearxngResult) {
  if (Array.isArray(result.engines)) {
    return result.engines.filter((engine) => typeof engine === "string");
  }
  if (typeof result.engine === "string") {
    return [result.engine];
  }
  return [];
}

export function todaySearchSuffix() {
  return `today ${new Date().toISOString().slice(0, 10)}`;
}

function searxngRequestHeaders() {
  return {
    Accept: "application/json",
    "X-Forwarded-For": "127.0.0.1",
    "X-Real-IP": "127.0.0.1",
    "User-Agent": "ai-hub-web-search/1.0",
  };
}

export async function fetchSearxngResults(url: URL) {
  const response = await fetch(url, {
    headers: searxngRequestHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `SearXNG search failed with ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as { results?: SearxngResult[] };
  return Array.isArray(payload.results) ? payload.results : [];
}

export function normalizeSearxngResults(
  results: SearxngResult[],
  limit: number,
): NormalizedSearxngResult[] {
  return results
    .filter(
      (result) =>
        typeof result.title === "string" && typeof result.url === "string",
    )
    .slice(0, limit)
    .map((result) => ({
      title: result.title as string,
      url: result.url as string,
      snippet:
        typeof result.content === "string" ? result.content.slice(0, 800) : "",
      score: typeof result.score === "number" ? result.score : null,
      engines: normalizeSearxngEngines(result),
    }));
}

export function summarizeSearchResults(results: NormalizedSearxngResult[]) {
  if (results.length === 0) {
    return "No web search results were returned.";
  }

  return results
    .map((result, index) => {
      const snippet = result.snippet ? ` — ${result.snippet}` : "";
      return `${index + 1}. ${result.title}${snippet}\n${result.url}`;
    })
    .join("\n\n");
}
