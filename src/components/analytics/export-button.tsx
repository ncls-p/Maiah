"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
export function AnalyticsExport({
  kind,
  query,
}: {
  kind: "usage" | "audit";
  query: string;
}) {
  const t = useTranslations("analytics");
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/analytics/${kind}?${query}&format=csv`,
      );
      if (!response.ok)
        throw new Error(response.status === 413 ? "tooLarge" : "failed");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${kind}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        t(
          error instanceof Error && error.message === "tooLarge"
            ? "exportTooLarge"
            : "loadFailed",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" disabled={busy} onClick={() => void download()}>
      {t(busy ? "loading" : "export")}
    </Button>
  );
}
