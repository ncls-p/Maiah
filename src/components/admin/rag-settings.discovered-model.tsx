"use client";



export type DiscoveredModel = {
  providerId: string;
  providerName: string;
  modelId: string;
  displayName?: string;
  embeddings: boolean;
  vision: boolean;
};
