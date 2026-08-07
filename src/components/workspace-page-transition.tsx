import type { ReactNode } from "react";

export function WorkspacePageTransition({ children }: { children: ReactNode }) {
  return <div className="workspace-route-content">{children}</div>;
}
