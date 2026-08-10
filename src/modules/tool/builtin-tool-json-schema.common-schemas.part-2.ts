import { TITLE_FIELD } from "./builtin-tool-json-schema.fallback-schema";
export const commonSchemasPart2 = {
  code_workspace_write_file: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid" },
      path: { type: "string", description: "Workspace-relative file path." },
      content: { type: "string", description: "Full text content to write." },
      attachmentId: {
        type: "string",
        format: "uuid",
        description:
          "Chat attachment ID to copy byte-for-byte into the workspace. Use this for uploaded images, fonts, media, or other assets.",
      },
    },
    required: ["projectId", "path"],
    oneOf: [{ required: ["content"] }, { required: ["attachmentId"] }],
  },
  code_workspace_replace_text: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid" },
      path: { type: "string", description: "Workspace-relative file path." },
      oldText: { type: "string", description: "Exact text to replace." },
      newText: { type: "string", description: "Replacement text." },
      replaceAll: { type: "boolean", default: false },
    },
    required: ["projectId", "path", "oldText", "newText"],
  },
  code_workspace_delete_file: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid" },
      path: { type: "string", description: "Workspace-relative file path." },
    },
    required: ["projectId", "path"],
  },
  github_get_publish_status: {
    type: "object",
    properties: {},
    required: [],
  },
  github_publish_code_workspace: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        format: "uuid",
        description: "Code workspace id to publish.",
      },
      repositoryId: {
        type: "string",
        format: "uuid",
        description:
          "User-scoped GitHub repository id returned by github_get_publish_status.",
      },
      mode: {
        type: "string",
        enum: ["pull_request", "direct_push"],
        description:
          "Use pull_request unless the user explicitly asks for direct push.",
      },
      targetBranch: {
        type: "string",
        description:
          "Target branch chosen by the user, including main if requested.",
      },
      sourceBranch: {
        type: "string",
        description: "Optional new branch name for pull_request mode.",
      },
      targetDirectory: {
        type: "string",
        description: "Optional repository subdirectory to write files into.",
      },
      commitMessage: { type: "string" },
      pullRequestTitle: { type: "string" },
      pullRequestBody: { type: "string" },
      confirmDirectPush: {
        type: "boolean",
        description:
          "Must be true only after the user explicitly confirmed direct push.",
        default: false,
      },
    },
    required: [
      "projectId",
      "repositoryId",
      "mode",
      "targetBranch",
      "commitMessage",
    ],
  },
  create_slide_deck: {
    type: "object",
    properties: {
      title: { type: "string", description: "Presentation title." },
      subtitle: { type: "string" },
      theme: {
        type: "string",
        enum: ["minimal", "deodis", "midnight", "warm"],
        default: "deodis",
      },
      accentColor: { type: "string", default: "#25adc5" },
      aspectRatio: { type: "string", enum: ["16:9", "4:3"], default: "16:9" },
      animation: {
        type: "string",
        enum: ["rise", "fade", "none"],
        default: "rise",
      },
      height: { type: "number", default: 560, minimum: 360, maximum: 900 },
      showPrintButton: { type: "boolean", default: true },
      slides: {
        type: "array",
        minItems: 1,
        maxItems: 30,
        items: {
          type: "object",
          properties: {
            layout: {
              type: "string",
              enum: [
                TITLE_FIELD,
                "section",
                "bullets",
                "two_column",
                "quote",
                "closing",
              ],
              default: "bullets",
            },
            kicker: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
            bullets: { type: "array", items: { type: "string" }, default: [] },
            secondaryTitle: { type: "string" },
            secondaryBullets: {
              type: "array",
              items: { type: "string" },
              default: [],
            },
            quote: { type: "string" },
            attribution: { type: "string" },
            metricValue: { type: "string" },
            metricLabel: { type: "string" },
            imageUrl: { type: "string", format: "uri" },
            imageAlt: { type: "string" },
            footer: { type: "string" },
            notes: { type: "string" },
          },
          required: [TITLE_FIELD],
        },
      },
    },
    required: [TITLE_FIELD, "slides"],
  },
  create_business_document: {
    type: "object",
    properties: {
      title: { type: "string" },
      documentType: {
        type: "string",
        enum: ["brief", "memo", "report", "proposal", "policy", "sop"],
      },
      audience: { type: "string" },
      executiveSummary: { type: "string" },
      sections: { type: "array", items: { type: "object" } },
      nextSteps: { type: "array", items: { type: "string" } },
      height: { type: "number", default: 620 },
    },
    required: [TITLE_FIELD, "sections"],
  },
};
