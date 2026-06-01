"use client";

import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function QuotaBanner({ used, limit }: { used: number; limit: number }) {
  const percent = Math.min(100, Math.round((used / limit) * 100));
  if (percent < 80) return null;

  return (
    <div className="animate-in-up border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-foreground">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangleIcon
            className="size-4 shrink-0 text-warning animate-pulse"
            aria-hidden="true"
          />
          <span>
            {percent >= 100
              ? "Monthly token limit reached."
              : `Approaching monthly token limit (${percent}%).`}
          </span>
        </div>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0"
        >
          <Link href="/usage">View usage</Link>
        </Button>
      </div>
    </div>
  );
}
