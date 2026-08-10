/**
 * Check whether a POSIX-normalised path attempts path traversal.
 */
export function isPathTraversal(normalizedPath: string): boolean {
  return (
    !normalizedPath ||
    normalizedPath === "." ||
    normalizedPath === ".." ||
    normalizedPath.startsWith("../") ||
    normalizedPath.includes("/../")
  );
}
