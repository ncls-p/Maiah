export const commonSchemasPart4 = {
  json_tool: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["validate", "format", "minify", "inspect"],
        default: "format",
      },
      json: { type: "string" },
    },
    required: ["json"],
  },
  text_stats: {
    type: "object",
    properties: {
      text: { type: "string" },
      wordsPerMinute: { type: "number", default: 200 },
    },
    required: ["text"],
  },
  base64_tool: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["encode", "decode"] },
      value: { type: "string" },
    },
    required: ["action", "value"],
  },
  hash_text: {
    type: "object",
    properties: {
      text: { type: "string" },
      algorithm: {
        type: "string",
        enum: ["sha256", "sha1", "md5"],
        default: "sha256",
      },
    },
    required: ["text"],
  },
  unit_converter: {
    type: "object",
    properties: {
      value: { type: "number" },
      from: { type: "string" },
      to: { type: "string" },
    },
    required: ["value", "from", "to"],
  },
  slugify_text: {
    type: "object",
    properties: {
      text: { type: "string" },
      separator: { type: "string", enum: ["-", "_"], default: "-" },
    },
    required: ["text"],
  },
  color_converter: {
    type: "object",
    properties: {
      hex: { type: "string", description: "6-digit hex color, e.g. #0ea5e9" },
    },
    required: ["hex"],
  },
  markdown_table: {
    type: "object",
    properties: {
      columns: { type: "array", items: { type: "string" } },
      rows: {
        type: "array",
        items: { type: "array", items: { type: "string" } },
      },
    },
    required: ["columns", "rows"],
  },
};
