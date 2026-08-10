import { cloneAgents } from "./workspace-clone.agents";
import {
  createWorkspaceCloneContext,
  type WorkspaceCloneInput,
} from "./workspace-clone.context";
import type { Executor } from "./workspace-clone.executor";
import { cloneKnowledgeAndTools } from "./workspace-clone.knowledge-and-tools";
import { cloneProviderInfrastructure } from "./workspace-clone.provider-infrastructure";
import { cloneWorkflowsAndAccess } from "./workspace-clone.workflows-and-access";

export async function cloneWorkspaceConfiguration(
  tx: Executor,
  input: WorkspaceCloneInput,
) {
  const context = createWorkspaceCloneContext(tx, input);
  await cloneProviderInfrastructure(context);
  await cloneKnowledgeAndTools(context);
  await cloneAgents(context);
  await cloneWorkflowsAndAccess(context);
}
