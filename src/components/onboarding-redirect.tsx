"use client";

import { usePathname, useRouter } from "@/i18n/navigation";
import { useEffect } from "react";

import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson, fetchWorkspacePermissions } from "@/lib/api-client";

const dataPortabilityPaths = new Set([
  "/admin/settings/data",
  "/admin/settings/organization-data",
]);

export function OnboardingRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaceId, isLoading } = useWorkspace();

  useEffect(() => {
    if (isLoading || !workspaceId) return;
    if (pathname === "/setup" || pathname === "/settings") return;
    // A fresh migration target must reach data import before configuring any AI provider.
    if (dataPortabilityPaths.has(pathname)) return;

    let cancelled = false;

    async function checkOnboarding() {
      try {
        const { completed } = await fetchJson<{ completed: boolean }>(
          "/api/onboarding",
        );
        if (cancelled || completed) return;

        const permissions = await fetchWorkspacePermissions(workspaceId!);
        if (cancelled || !permissions.canManageProviders) return;

        const providers = await fetchJson<unknown[]>(
          `/api/workspace/providers?workspaceId=${workspaceId}`,
        );
        if (cancelled) return;
        if (Array.isArray(providers) && providers.length === 0) {
          router.replace("/setup");
        }
      } catch {
        // Ignore onboarding redirect failures
      }
    }

    void checkOnboarding();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, isLoading, pathname, router]);

  return null;
}
