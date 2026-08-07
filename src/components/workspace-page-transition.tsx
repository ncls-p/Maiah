"use client";

import type { ReactNode } from "react";

import { usePathname } from "@/i18n/navigation";

export function WorkspacePageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="workspace-route-content">
      {children}
    </div>
  );
}
