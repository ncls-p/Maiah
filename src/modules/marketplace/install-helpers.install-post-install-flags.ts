import type { MarketplaceManifest } from "./manifest-types";

export function installPostInstallFlags(manifest: MarketplaceManifest): {
  requiresCredentials: boolean;
} {
  if (manifest.type === "mcp_preset") {
    return {
      requiresCredentials: manifest.preset.requiresCredentials,
    };
  }
  if (manifest.type === "custom_tool") {
    return {
      requiresCredentials: Boolean(manifest.tool.requiresCredentials),
    };
  }
  if (manifest.type === "agent") {
    const bundledRequiresCredentials =
      (manifest.bundledResources?.mcpPresets ?? []).some(
        (preset) => preset.preset.requiresCredentials,
      ) ||
      (manifest.bundledResources?.customTools ?? []).some((tool) =>
        Boolean(tool.tool.requiresCredentials),
      );
    return {
      requiresCredentials:
        bundledRequiresCredentials ||
        (manifest.specialists ?? []).some(
          (specialist) =>
            installPostInstallFlags(specialist.manifest).requiresCredentials,
        ),
    };
  }
  return { requiresCredentials: false };
}
