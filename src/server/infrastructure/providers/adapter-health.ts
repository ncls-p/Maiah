import type { ProviderHealth,ProviderRuntimeConfig } from "./adapter";

export async function validateModelsEndpoint(config: ProviderRuntimeConfig, baseUrl: string, headers: Record<string, string>): Promise<ProviderHealth> {
  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      return { status: "unhealthy", message: `HTTP ${response.status}: ${response.statusText}`, latencyMs: Date.now() - start };
    }
    return { status: "healthy", message: "Connected successfully", latencyMs: Date.now() - start };
  } catch (error) {
    return { status: "unhealthy", message: (error as Error).message, latencyMs: Date.now() - start };
  }
}

export async function fetchModelCatalog(baseUrl: string, headers: Record<string, string>) {
  const response = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Failed to list models: HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}
