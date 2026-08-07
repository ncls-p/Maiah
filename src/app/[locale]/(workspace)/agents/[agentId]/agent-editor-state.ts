import type { Agent } from "./types";

/**
 * Mutation responses contain the persisted agent row, while the editor GET
 * also projects access flags and the resolved share target email. Keep that
 * client-only projection stable after an in-place save.
 */
export function mergeAgentEditorState(
  current: Agent,
  persisted: Agent,
  overrides: Partial<Pick<Agent, "shareTargetEmail" | "access">> = {},
): Agent {
  return {
    ...persisted,
    canAdminCurate: current.canAdminCurate,
    canEdit: current.canEdit,
    canClone: current.canClone,
    access: overrides.access ?? current.access,
    accessOptions: current.accessOptions,
    shareTargetEmail: Object.hasOwn(overrides, "shareTargetEmail")
      ? overrides.shareTargetEmail
      : (persisted.shareTargetEmail ?? current.shareTargetEmail),
  };
}
