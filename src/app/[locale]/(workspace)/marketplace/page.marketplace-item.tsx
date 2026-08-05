"use client";


export interface MarketplaceItem {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  visibility: string;
  installCount: number;
  totalDownloads: number;
  isFeatured: boolean;
  featuredOrder?: number | null;
  ratingAverage?: string | null;
  verifiedPublisher: boolean;
  publishedAt: string | null;
  createdAt: string;
  tagsJson: string[] | null;
  publisherUserId: string;
  shareCount?: number;
}

export type MarketplaceFilters = {
  search: string;
  typeFilter: string;
  sortBy: string;
};

type MarketplaceItemComparator = (
  a: MarketplaceItem,
  b: MarketplaceItem,
) => number;

function matchesMarketplaceSearch(item: MarketplaceItem, query: string) {
  const searchableValues = [
    item.name,
    item.description,
    ...(item.tagsJson ?? []),
  ];
  return searchableValues.some((value) => value?.toLowerCase().includes(query));
}

const MARKETPLACE_SORTERS: Record<string, MarketplaceItemComparator> = {
  newest: (a, b) =>
    new Date(b.publishedAt ?? b.createdAt).getTime() -
    new Date(a.publishedAt ?? a.createdAt).getTime(),
  downloads: (a, b) => b.totalDownloads - a.totalDownloads,
  featured: (a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    const orderDiff = (b.featuredOrder ?? 0) - (a.featuredOrder ?? 0);
    return orderDiff || b.totalDownloads - a.totalDownloads;
  },
};

function filterMarketplaceItems(
  items: MarketplaceItem[],
  { search, typeFilter }: MarketplaceFilters,
) {
  const query = search.trim().toLowerCase();

  return items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    return query ? matchesMarketplaceSearch(item, query) : true;
  });
}

export function filterAndSortMarketplaceItems(
  items: MarketplaceItem[],
  filters: MarketplaceFilters,
): MarketplaceItem[] {
  const sorter =
    MARKETPLACE_SORTERS[filters.sortBy] ?? MARKETPLACE_SORTERS.featured;
  return [...filterMarketplaceItems(items, filters)].sort(sorter);
}
