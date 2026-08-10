"use client";

import { formatMarketplaceDate } from "@/components/marketplace/marketplace-i18n-helpers";
import {
  ItemIcon,
  getItemLabel,
} from "@/components/marketplace/marketplace-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import {
  Download,
  ExternalLink,
  PackagePlus,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { MarketplaceItem } from "./page.marketplace-item";

export function MarketplaceItemCard({
  item,
  isOwner,
  onInstall,
  onShare,
  onDelete,
  onFeature,
  onUnfeature,
  isAdmin,
  locale,
  t,
  tMarketplace,
}: {
  item: MarketplaceItem;
  isOwner: boolean;
  isAdmin: boolean;
  locale: string;
  t: ReturnType<typeof useTranslations<"marketplace.list">>;
  tMarketplace: ReturnType<typeof useTranslations<"marketplace">>;
  onInstall: (id: string) => void;
  onShare: (item: MarketplaceItem) => void;
  onDelete: (id: string) => void;
  onFeature: (id: string) => void;
  onUnfeature: (id: string) => void;
}) {
  const itemTypeLabel = getItemLabel(item.type, (key) =>
    tMarketplace(key as "itemTypes.agent"),
  );

  return (
    <Card
      className={
        item.isFeatured
          ? "ring-1 ring-yellow-500/30 bg-yellow-500/[0.03]"
          : undefined
      }
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <div className="flex items-center justify-center size-9 shrink-0 rounded-lg bg-muted">
            <ItemIcon
              type={item.type}
              className="size-5 text-muted-foreground"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <CardTitle className="text-base leading-snug">
                {item.name}
              </CardTitle>
              {item.isFeatured ? (
                <Badge
                  variant="default"
                  className="shrink-0 bg-yellow-500 text-black text-[10px] uppercase tracking-wide"
                >
                  <Star className="size-3 mr-0.5 fill-current" />
                  {t("featured")}
                </Badge>
              ) : null}
            </div>
            <CardDescription className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {itemTypeLabel}
              </Badge>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {item.description}
          </p>
        )}
        {item.tagsJson && item.tagsJson.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tagsJson.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Download className="size-3" /> {item.totalDownloads}
            </span>
            <span>{formatMarketplaceDate(item.publishedAt, locale)}</span>
          </div>
          <div className="flex items-center gap-1">
            {isOwner && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={t("share")}
                  onClick={() => onShare(item)}
                >
                  <Share2 className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 text-destructive"
                  aria-label={t("delete")}
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </>
            )}
            {isAdmin && (
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={
                  item.isFeatured ? t("toast.unfeatured") : t("toast.featured")
                }
                onClick={() =>
                  item.isFeatured ? onUnfeature(item.id) : onFeature(item.id)
                }
              >
                <Star
                  className={`size-3 ${item.isFeatured ? "fill-yellow-400 text-yellow-400" : ""}`}
                />
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => onInstall(item.id)}
          >
            <PackagePlus className="size-3 mr-1" />
            {t("install")}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/marketplace/items/${item.id}`}>
              <ExternalLink className="size-3 mr-1" />
              {t("viewDetails")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
