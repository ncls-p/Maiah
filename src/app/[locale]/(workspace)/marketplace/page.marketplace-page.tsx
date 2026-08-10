"use client";

import { useWorkspaceShell } from "@/components/app-shell";
import { type ShareableResource } from "@/components/marketplace/resource-share-dialog";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  MarketplaceFilters,
  MarketplaceItem,
  filterAndSortMarketplaceItems,
} from "./page.marketplace-item";
import { MarketplacePageView } from "./page.marketplace-page.view";

export function useMarketplacePageController() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("marketplace.list");
  const tMarketplace = useTranslations("marketplace");
  const { workspaceId } = useWorkspace();
  const { currentUserId, isAdmin = false } = useWorkspaceShell();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [publishedItems, setPublishedItems] = useState<MarketplaceItem[]>([]);
  const [ownedItems, setOwnedItems] = useState<MarketplaceItem[]>([]);
  const [sharedItems, setSharedItems] = useState<MarketplaceItem[]>([]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("featured");

  const [shareResource, setShareResource] = useState<ShareableResource | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const typeOptions = useMemo(
    () =>
      [
        { value: "all", labelKey: "types.all" },
        { value: "agent", labelKey: "types.agent" },
        { value: "skill", labelKey: "types.skill" },
        { value: "mcp_preset", labelKey: "types.mcp_preset" },
      ] as const,
    [],
  );

  const fetchMarketplaceData = useCallback(async (): Promise<{
    published: MarketplaceItem[];
    owned: MarketplaceItem[];
    shared: MarketplaceItem[];
  }> => {
    const [publishedRes, mineRes, sharedRes] = await Promise.all([
      fetch("/api/marketplace/items"),
      fetch("/api/marketplace/items?_path=my-items"),
      fetch("/api/marketplace/items?_path=shared-with-me"),
    ]);

    const marketplaceRequestsOk = publishedRes.ok && mineRes.ok && sharedRes.ok;
    if (!marketplaceRequestsOk) {
      throw new Error(t("toast.loadFailed"));
    }

    const published = (await publishedRes.json()) as MarketplaceItem[];
    const mine = (await mineRes.json()) as MarketplaceItem[];
    const sharedData = await sharedRes.json();
    const shared = Array.isArray(sharedData)
      ? sharedData.map((s: { item: MarketplaceItem }) => s.item)
      : [];
    const withoutCustomTools = (items: MarketplaceItem[]) =>
      items.filter((item) => item.type !== "custom_tool");
    return {
      published: withoutCustomTools(published),
      owned: withoutCustomTools(mine),
      shared: withoutCustomTools(shared),
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    fetchMarketplaceData()
      .then((data) => {
        if (!cancelled) {
          setPublishedItems(data.published);
          setOwnedItems(data.owned);
          setSharedItems(data.shared);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(true);
          toast.error(
            error instanceof Error ? error.message : t("toast.loadFailed"),
          );
        }
        return;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchMarketplaceData, t]);

  const filters = useMemo<MarketplaceFilters>(
    () => ({ search, typeFilter, sortBy }),
    [search, typeFilter, sortBy],
  );

  const myItems = useMemo(
    () => ownedItems.filter((item) => item.publisherUserId === currentUserId),
    [ownedItems, currentUserId],
  );

  const filteredPublished = useMemo(
    () => filterAndSortMarketplaceItems(publishedItems, filters),
    [publishedItems, filters],
  );

  const filteredMyItems = useMemo(
    () => filterAndSortMarketplaceItems(myItems, filters),
    [myItems, filters],
  );

  const filteredShared = useMemo(
    () => filterAndSortMarketplaceItems(sharedItems, filters),
    [sharedItems, filters],
  );

  const handleInstall = useCallback(
    async (itemId: string) => {
      if (!workspaceId) return;
      try {
        const res = await fetch(`/api/marketplace/items/${itemId}/install`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        });
        if (res.ok) {
          const payload = await res.json();
          toast.success(t("toast.installed"));
          if (payload.requiresCredentials) {
            toast.info(t("toast.credentialsNeeded"), { duration: 8000 });
          }
          if (payload.agent?.id) {
            router.push(`/agents/${payload.agent.id}`);
          } else if (payload.skill?.id) {
            router.push("/tools?tab=skills");
          } else if (payload.custom_tool?.id) {
            router.push("/workflows");
          } else if (payload.mcp_preset?.id) {
            router.push("/tools?tab=mcp");
          }
        } else {
          toast.error(
            (await res.json().catch(() => ({}))).error ||
              t("toast.installFailed"),
          );
        }
      } catch {
        toast.error(t("toast.installFailed"));
        return;
      }
    },
    [workspaceId, router, t],
  );

  const reload = useCallback(() => {
    fetchMarketplaceData()
      .then((data) => {
        setPublishedItems(data.published);
        setOwnedItems(data.owned);
        setSharedItems(data.shared);
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : t("toast.loadFailed"),
        );
        return;
      });
  }, [fetchMarketplaceData, t]);

  const handleDelete = useCallback(
    async (itemId: string) => {
      setDeleting(true);
      try {
        const res = await fetch(`/api/marketplace/items/${itemId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          toast.error(t("toast.deleteFailed"));
          return;
        }
        setPendingDelete(null);
        toast.success(t("toast.deleted"));
        reload();
      } catch {
        toast.error(t("toast.deleteFailed"));
        return;
      } finally {
        setDeleting(false);
      }
    },
    [reload, t],
  );

  const requestDelete = useCallback(
    (itemId: string) => {
      const item = [...publishedItems, ...ownedItems, ...sharedItems].find(
        (candidate) => candidate.id === itemId,
      );
      if (item) setPendingDelete({ id: item.id, name: item.name });
    },
    [ownedItems, publishedItems, sharedItems],
  );

  const handleFeature = useCallback(
    async (itemId: string) => {
      const res = await fetch(`/api/marketplace/items/${itemId}/feature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast.success(t("toast.featured"));
        reload();
      } else {
        toast.error(t("toast.loadFailed"));
      }
    },
    [reload, t],
  );

  const handleUnfeature = useCallback(
    async (itemId: string) => {
      const res = await fetch(`/api/marketplace/items/${itemId}/feature`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(t("toast.unfeatured"));
        reload();
      } else {
        toast.error(t("toast.loadFailed"));
      }
    },
    [reload, t],
  );

  const openShareDialog = useCallback((item: MarketplaceItem) => {
    setShareResource({
      kind: "marketplace_item",
      id: item.id,
      name: item.name,
      publisherUserId: item.publisherUserId,
    });
  }, []);

  if (loading) {
    return (
      <WorkspacePage
        title={tMarketplace("title")}
        description={tMarketplace("description")}
      >
        <PageLoading label={t("loading")} />
      </WorkspacePage>
    );
  }
  if (loadError) {
    return (
      <WorkspacePage
        title={tMarketplace("title")}
        description={tMarketplace("description")}
      >
        <div
          className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5"
          role="alert"
        >
          <h2 className="text-base font-semibold">{t("toast.loadFailed")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("loadFailedDescription")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            {t("retry")}
          </Button>
        </div>
      </WorkspacePage>
    );
  }

  const hasMarketplaceItems =
    publishedItems.length + myItems.length + sharedItems.length > 0;

  return {
    kind: "ready",
    currentUserId,
    deleting,
    filteredMyItems,
    filteredPublished,
    filteredShared,
    handleDelete,
    handleFeature,
    handleInstall,
    handleUnfeature,
    hasMarketplaceItems,
    isAdmin,
    locale,
    openShareDialog,
    pendingDelete,
    reload,
    requestDelete,
    search,
    setPendingDelete,
    setSearch,
    setShareResource,
    setSortBy,
    setTypeFilter,
    shareResource,
    sortBy,
    t,
    tMarketplace,
    typeFilter,
    typeOptions,
    workspaceId,
  } as const;
}

export default function MarketplacePage(
  ...args: Parameters<typeof useMarketplacePageController>
) {
  const model = useMarketplacePageController(...args);
  if (!("kind" in model)) return model;
  return <MarketplacePageView model={model} />;
}
