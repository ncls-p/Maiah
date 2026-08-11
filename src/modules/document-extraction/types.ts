import type { RagConfig } from "@/modules/knowledge/rag-config-schema";

export type VisualRegionKind =
  "text" | "diagram" | "table" | "image-description";

export type VisualRegion = {
  kind: VisualRegionKind;
  sourceKind: "page" | "asset" | "image";
  sourceRef: string;
  text: string;
  description: string;
  confidence: number;
};

export type DocumentExtractionResult = {
  markdown: string;
  engine: "anydoc" | "text" | "none";
  visualRegions: VisualRegion[];
  ocrApplied: boolean;
  warnings: string[];
};

export type DocumentExtractionInput = {
  workspaceId?: string;
  fileName: string;
  mimeType?: string;
  bytes: Uint8Array;
  config?: RagConfig;
};
