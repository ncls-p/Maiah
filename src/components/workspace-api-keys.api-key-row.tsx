"use client";

import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  scopes: string[];
};

export type ApiKeyScope = {
  permission: string;
  group: string;
  risk: "read" | "write" | "admin";
};

export type ApiKeyResponse = {
  keys: ApiKeyRow[];
  availableScopes: ApiKeyScope[];
  presets: {
    readOnly: string[];
    agentRuntime: string[];
  };
};

type ApiKeysTranslator = ReturnType<typeof useTranslations<"admin.apiKeys">>;

export async function fetchApiKeys(workspaceId: string, t: ApiKeysTranslator) {
  const res = await fetch(`/api/workspace/api-keys?workspaceId=${workspaceId}`);
  if (!res.ok) throw new Error(t("loadFailed"));
  return (await res.json()) as ApiKeyResponse;
}

export async function createApiKey(
  workspaceId: string,
  name: string,
  scopes: string[],
  t: ApiKeysTranslator,
) {
  const res = await fetch("/api/workspace/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, name: name.trim(), scopes }),
  });
  if (!res.ok) throw new Error((await res.json()).error || t("createFailed"));
  return ((await res.json()) as { rawKey: string }).rawKey;
}

export async function revokeApiKey(workspaceId: string, keyId: string) {
  return fetch(`/api/workspace/api-keys/${keyId}?workspaceId=${workspaceId}`, {
    method: "DELETE",
  });
}

export function ApiKeyListItem({
  apiKey,
  locale,
  onRevokeAction,
  t,
}: {
  apiKey: ApiKeyRow;
  locale: string;
  onRevokeAction: (apiKey: ApiKeyRow) => void;
  t: ApiKeysTranslator;
}) {
  const lastUsedLabel = apiKey.lastUsedAt
    ? t("lastUsed", {
        date: new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(apiKey.lastUsedAt)),
      })
    : t("neverUsed");

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="font-medium">{apiKey.name}</p>
        <p className="text-xs text-muted-foreground">
          {apiKey.keyPrefix}… · {lastUsedLabel}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("scopeCount", { count: apiKey.scopes.length })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{t("active")}</Badge>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => onRevokeAction(apiKey)}
          aria-label={t("revokeLabel", { name: apiKey.name })}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
