import { notFound } from "next/navigation";

import { CodeWorkspaceWindow } from "@/components/chat/code-workspace-window";

import { UUID_PATTERN, firstValue } from "./page.params";

export default async function CodeWorkspacePopoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { projectId } = await params;
  if (!UUID_PATTERN.test(projectId)) notFound();
  const query = await searchParams;
  return (
    <CodeWorkspaceWindow
      projectId={projectId}
      workspaceId={firstValue(query.workspaceId)}
      initialPath={firstValue(query.path) ?? null}
      surface="workbench"
    />
  );
}
