import { sourceCodeExtensions } from "@/modules/files/source-code-extensions";

const codeWorkspaceExtensions = new Set<string>([
  ...sourceCodeExtensions,
  ".htm",
  ".html",
]);

function fileExtension(fileName: string) {
  const baseName = fileName.replaceAll("\\", "/").split("/").pop() ?? "";
  const dotIndex = baseName.lastIndexOf(".");
  return dotIndex > 0 ? baseName.slice(dotIndex).toLowerCase() : "";
}

export async function zipContainsCodeWorkspace(file: Blob) {
  try {
    const { default: JSZip } = await import("jszip");
    const archive = await JSZip.loadAsync(await file.arrayBuffer());
    return Object.values(archive.files).some(
      (entry) =>
        !entry.dir && codeWorkspaceExtensions.has(fileExtension(entry.name)),
    );
  } catch {
    return false;
  }
}
