/**
 * Shared deliverable rule for sandbox output files, used by the server
 * (persistence, specialist visual outputs) and the chat UI (visibility).
 *
 * A file is a deliverable when the run created it, or when it came from the
 * input and was modified. An input file whose modification state is unknown is
 * treated as a deliverable so a persisted file is never hidden.
 *
 * Kept free of server-only imports so client components can use it.
 */
export function isSandboxDeliverableFile(file: {
  fromInput?: unknown;
  modified?: unknown;
}) {
  return file.fromInput !== true || file.modified !== false;
}
