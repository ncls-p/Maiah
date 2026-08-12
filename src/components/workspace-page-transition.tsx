"use client";

import { ViewTransition, type ReactNode } from "react";

export function WorkspacePageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      name="workspace-route-viewport"
      default="none"
      update={{ "workspace-route": "workspace-route", default: "none" }}
    >
      <div className="workspace-route-content">{children}</div>
    </ViewTransition>
  );
}
