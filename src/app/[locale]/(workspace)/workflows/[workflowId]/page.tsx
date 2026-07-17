import "@xyflow/react/dist/style.css";

import { WorkflowEditorPage } from "@/components/workflows/workflow-editor-page";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;
  return <WorkflowEditorPage workflowId={workflowId} />;
}
