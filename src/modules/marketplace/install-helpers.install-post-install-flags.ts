import type {
MarketplaceManifest
} from "./manifest-types";

export function installPostInstallFlags(manifest: MarketplaceManifest) {
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
  return { requiresCredentials: false };
}
