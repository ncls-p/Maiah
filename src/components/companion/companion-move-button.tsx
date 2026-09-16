"use client";
import { GripIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { useCompanionPosition } from "./use-companion-position";
export function CompanionMoveButton({
  position,
}: {
  position: ReturnType<typeof useCompanionPosition>;
}) {
  const t = useTranslations("companion");
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("move")}
      title={t("moveHint")}
      className="touch-none cursor-grab rounded-full"
      onPointerDown={position.pointerDown}
      onKeyDown={position.keyDown}
    >
      <GripIcon />
    </Button>
  );
}
