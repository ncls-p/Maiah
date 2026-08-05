import type { JSONValue } from "@ai-sdk/provider";
import {
Output,
type ModelMessage,
type ToolChoice,
type ToolSet
} from "ai";

import type {
ProxyResponseFormat
} from "@/modules/openai-proxy/contracts";
import { invalidRequest } from "@/modules/openai-proxy/errors";

type PreparedOutput =
  | ReturnType<typeof Output.text>
  | ReturnType<typeof Output.json>
  | ReturnType<typeof Output.object>;

export type PreparedProxyGeneration = {
  messages: ModelMessage[];
  tools: ToolSet | undefined;
  toolChoice: ToolChoice<ToolSet> | undefined;
  output: PreparedOutput;
  responseFormat: ProxyResponseFormat;
  maxOutputTokens: number | undefined;
  temperature: number | undefined;
  topP: number | undefined;
  topK: number | undefined;
  presencePenalty: number | undefined;
  frequencyPenalty: number | undefined;
  seed: number | undefined;
  stopSequences: string[] | undefined;
  providerOptions: Record<string, JSONValue | undefined>;
};

export function objectValue(value: unknown, param: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRequest(`Expected an object for '${param}'.`, param);
  }
  return value as Record<string, unknown>;
}

export function stringValue(value: unknown, param: string) {
  if (typeof value !== "string") {
    throw invalidRequest(`Expected a string for '${param}'.`, param);
  }
  return value;
}

export function parseJson(value: string, param: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw invalidRequest(`Invalid JSON in '${param}'.`, param, "invalid_json");
  }
}

function urlValue(value: unknown, param: string) {
  const raw = stringValue(value, param);
  try {
    return new URL(raw);
  } catch {
    throw invalidRequest(`Invalid URL in '${param}'.`, param);
  }
}

export function textContent(value: unknown, param: string) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) {
    throw invalidRequest(`Expected text content for '${param}'.`, param);
  }
  return value
    .map((part, index) => {
      const item = objectValue(part, `${param}.${index}`);
      if (
        item.type !== "text" &&
        item.type !== "input_text" &&
        item.type !== "output_text"
      ) {
        throw invalidRequest(
          `Unsupported content type '${String(item.type)}' in '${param}'.`,
          `${param}.${index}.type`,
          "unsupported_content_type",
        );
      }
      return stringValue(item.text, `${param}.${index}.text`);
    })
    .join("");
}

export function userContent(value: unknown, param: string) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) {
    throw invalidRequest(`Expected user content for '${param}'.`, param);
  }

  return value.map((part, index) => {
    const item = objectValue(part, `${param}.${index}`);
    if (item.type === "text" || item.type === "input_text") {
      return {
        type: "text" as const,
        text: stringValue(item.text, `${param}.${index}.text`),
      };
    }
    if (item.type === "image_url") {
      const image =
        typeof item.image_url === "string"
          ? item.image_url
          : objectValue(item.image_url, `${param}.${index}.image_url`).url;
      return {
        type: "file" as const,
        mediaType: "image",
        data: urlValue(image, `${param}.${index}.image_url.url`),
      };
    }
    if (item.type === "input_image") {
      return {
        type: "file" as const,
        mediaType: "image",
        data: urlValue(item.image_url, `${param}.${index}.image_url`),
      };
    }
    if (item.type === "input_file" && typeof item.file_url === "string") {
      return {
        type: "file" as const,
        mediaType: "application/octet-stream",
        data: urlValue(item.file_url, `${param}.${index}.file_url`),
        filename: typeof item.filename === "string" ? item.filename : undefined,
      };
    }
    if (item.type === "input_file" && typeof item.file_data === "string") {
      return {
        type: "file" as const,
        mediaType: "application/octet-stream",
        data: item.file_data,
        filename: typeof item.filename === "string" ? item.filename : undefined,
      };
    }
    throw invalidRequest(
      `Unsupported content type '${String(item.type)}' in '${param}'.`,
      `${param}.${index}.type`,
      "unsupported_content_type",
    );
  });
}

export function toolResultOutput(value: unknown) {
  if (typeof value === "string") return { type: "text" as const, value };
  return { type: "json" as const, value: value as JSONValue };
}
