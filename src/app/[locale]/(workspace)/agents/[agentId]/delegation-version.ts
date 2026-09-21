import type { DelegationBinding } from "./types";

export function updateSpecialistVersion(
  bindings: DelegationBinding[],
  childAgentId: string,
  activeVersionId: string,
): DelegationBinding[] {
  return bindings.map((binding) =>
    binding.childAgentId === childAgentId &&
    binding.childAgentVersionId !== activeVersionId
      ? { ...binding, childAgentVersionId: activeVersionId, childVersion: null }
      : binding,
  );
}
