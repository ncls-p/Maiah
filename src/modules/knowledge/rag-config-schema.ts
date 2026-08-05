import { z } from "zod";

export const ragConfigSchema = z
  .object({
    embedding: z.object({
      providerId: z.uuid().nullable().default(null),
      modelId: z.string().trim().max(255).default(""),
      dimensions: z
        .number()
        .int()
        .positive()
        .max(65_535)
        .nullable()
        .default(null),
    }),
    chunking: z.object({
      maxCharacters: z.number().int().min(200).max(20_000).default(1_200),
      overlapCharacters: z.number().int().min(0).max(4_000).default(160),
    }),
    retrieval: z.object({
      candidateCount: z.number().int().min(1).max(100).default(20),
      resultCount: z.number().int().min(1).max(50).default(5),
      minimumScore: z.number().min(-1).max(1).default(0.15),
    }),
    reranking: z.object({
      enabled: z.boolean().default(false),
      providerId: z.uuid().nullable().default(null),
      modelId: z.string().trim().max(255).default(""),
    }),
    extraction: z
      .object({
        engine: z.literal("anydoc").default("anydoc"),
        ocr: z
          .object({
            enabled: z.boolean().default(false),
            providerId: z.uuid().nullable().default(null),
            modelId: z.string().trim().max(255).default(""),
            minimumTextCharactersPerPage: z
              .number()
              .int()
              .min(0)
              .max(10_000)
              .default(80),
            maxVisualPages: z.number().int().min(1).max(500).default(50),
            describeDiagrams: z.boolean().default(true),
          })
          .default({
            enabled: false,
            providerId: null,
            modelId: "",
            minimumTextCharactersPerPage: 80,
            maxVisualPages: 50,
            describeDiagrams: true,
          }),
      })
      .default({
        engine: "anydoc",
        ocr: {
          enabled: false,
          providerId: null,
          modelId: "",
          minimumTextCharactersPerPage: 80,
          maxVisualPages: 50,
          describeDiagrams: true,
        },
      }),
  })
  .superRefine((config, context) => {
    if (config.chunking.overlapCharacters >= config.chunking.maxCharacters) {
      context.addIssue({
        code: "custom",
        path: ["chunking", "overlapCharacters"],
        message: "Chunk overlap must be smaller than chunk size",
      });
    }
    if (config.reranking.enabled && !config.reranking.modelId) {
      context.addIssue({
        code: "custom",
        path: ["reranking", "modelId"],
        message: "A reranking model is required when reranking is enabled",
      });
    }
    if (config.extraction.ocr.enabled && !config.extraction.ocr.modelId) {
      context.addIssue({
        code: "custom",
        path: ["extraction", "ocr", "modelId"],
        message:
          "An OCR/VLM model is required when visual extraction is enabled",
      });
    }
  });

export type RagConfig = z.infer<typeof ragConfigSchema>;

export const DEFAULT_RAG_CONFIG: RagConfig = ragConfigSchema.parse({
  embedding: {},
  chunking: {},
  retrieval: {},
  reranking: {},
});

export function parseRagConfig(value: unknown): RagConfig {
  const parsed = ragConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_RAG_CONFIG;
}

export function hasSameRagModelSelection(left: RagConfig, right: RagConfig) {
  return (
    left.embedding.providerId === right.embedding.providerId &&
    left.embedding.modelId === right.embedding.modelId &&
    left.embedding.dimensions === right.embedding.dimensions &&
    left.reranking.providerId === right.reranking.providerId &&
    left.reranking.modelId === right.reranking.modelId &&
    left.extraction.ocr.providerId === right.extraction.ocr.providerId &&
    left.extraction.ocr.modelId === right.extraction.ocr.modelId
  );
}
