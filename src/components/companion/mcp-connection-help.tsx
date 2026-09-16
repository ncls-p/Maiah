"use client";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
export function McpConnectionHelp() {
  const t = useTranslations("companion");
  const url = useSyncExternalStore(
    subscribe,
    () => `${location.origin}/api/mcp`,
    () => "/api/mcp",
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("mcpTitle")}</CardTitle>
        <CardDescription>{t("mcpHelp")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Input
          readOnly
          value={url}
          aria-label="MCP URL"
          onFocus={(event) => event.target.select()}
        />
      </CardContent>
    </Card>
  );
}

const subscribe = () => () => {};
