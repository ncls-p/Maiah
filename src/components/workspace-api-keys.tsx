"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ChevronDownIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/use-workspace";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  scopes: string[];
};

type ApiKeyScope = {
  permission: string;
  group: string;
  risk: "read" | "write" | "admin";
};

type ApiKeyResponse = {
  keys: ApiKeyRow[];
  availableScopes: ApiKeyScope[];
  presets: {
    readOnly: string[];
    agentRuntime: string[];
  };
};

type ApiKeysTranslator = ReturnType<typeof useTranslations<"admin.apiKeys">>;

async function fetchApiKeys(workspaceId: string, t: ApiKeysTranslator) {
  const res = await fetch(`/api/workspace/api-keys?workspaceId=${workspaceId}`);
  if (!res.ok) throw new Error(t("loadFailed"));
  return (await res.json()) as ApiKeyResponse;
}

async function createApiKey(
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

async function revokeApiKey(workspaceId: string, keyId: string) {
  return fetch(`/api/workspace/api-keys/${keyId}?workspaceId=${workspaceId}`, {
    method: "DELETE",
  });
}

function ApiKeyListItem({
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

export function WorkspaceApiKeys() {
  const t = useTranslations("admin.apiKeys");
  const locale = useLocale();
  const { workspaceId } = useWorkspace();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [availableScopes, setAvailableScopes] = useState<ApiKeyScope[]>([]);
  const [presets, setPresets] = useState<ApiKeyResponse["presets"]>({
    readOnly: [],
    agentRuntime: [],
  });
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKeyRow | null>(null);
  const [name, setName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetchApiKeys(workspaceId, t);
      setKeys(response.keys);
      setAvailableScopes(response.availableScopes);
      setPresets(response.presets);
      setSelectedScopes((current) => {
        const available = new Set(
          response.availableScopes.map(({ permission }) => permission),
        );
        const stillAvailable = current.filter((scope) => available.has(scope));
        if (stillAvailable.length > 0) return stillAvailable;
        const recommended = response.presets.agentRuntime.filter((scope) =>
          available.has(scope),
        );
        return recommended.length > 0
          ? recommended
          : response.presets.readOnly.filter((scope) => available.has(scope));
      });
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [t, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async key bootstrap
    void load();
  }, [load, workspaceId]);

  async function createKey() {
    if (!workspaceId || !name.trim() || selectedScopes.length === 0) return;
    setCreating(true);
    try {
      setRevealedKey(await createApiKey(workspaceId, name, selectedScopes, t));
      setName("");
      await load();
      toast.success(t("created"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("createFailed"));
      return;
    } finally {
      setCreating(false);
    }
  }

  function applyScopes(scopes: readonly string[]) {
    const available = new Set(
      availableScopes.map(({ permission }) => permission),
    );
    setSelectedScopes(scopes.filter((scope) => available.has(scope)));
  }

  function toggleScope(permission: string, checked: boolean) {
    setSelectedScopes((current) =>
      checked
        ? [...new Set([...current, permission])]
        : current.filter((scope) => scope !== permission),
    );
  }

  const groupedScopes = Object.groupBy(availableScopes, ({ group }) => group);

  async function revokeKey(keyId: string) {
    if (!workspaceId) return;
    setRevoking(true);
    try {
      const res = await revokeApiKey(workspaceId, keyId);
      if (!res.ok) {
        toast.error(t("revokeFailed"));
        return;
      }
      setPendingRevoke(null);
      await load();
      toast.success(t("revoked"));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4" aria-hidden="true" />
            {t("cardTitle")}
          </CardTitle>
          <CardDescription>
            {t.rich("cardDescription", {
              code: (chunks) => <code className="text-xs">{chunks}</code>,
              link: (chunks) => (
                <a
                  href="/api-docs"
                  className="underline underline-offset-4"
                  target="_blank"
                  rel="noreferrer"
                >
                  {chunks}
                </a>
              ),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-4" suppressHydrationWarning>
            <div className="flex flex-col gap-2">
              <Label htmlFor="api-key-name">{t("nameLabel")}</Label>
              <Input
                id="api-key-name"
                name="api-key-name"
                autoComplete="off"
                data-1p-ignore
                data-bwignore
                data-form-type="other"
                data-lpignore="true"
                data-protonpass-ignore
                placeholder="CI pipeline…"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium">
                {t("scopesTitle")}
              </legend>
              <p className="text-sm text-muted-foreground">
                {t("scopesDescription")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyScopes(presets.agentRuntime)}
                >
                  {t("presetAgentRuntime")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyScopes(presets.readOnly)}
                >
                  {t("presetReadOnly")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyScopes(
                      availableScopes.map(({ permission }) => permission),
                    )
                  }
                >
                  {t("presetFullAccess")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedScopes([])}
                >
                  {t("clearScopes")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {t("selectedScopes", {
                  selected: selectedScopes.length,
                  total: availableScopes.length,
                })}
              </p>
              {availableScopes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("noAvailableScopes")}
                </p>
              ) : (
                <div className="grid gap-2 lg:grid-cols-2">
                  {Object.entries(groupedScopes).map(([group, scopes]) => (
                    <Collapsible
                      key={group}
                      defaultOpen={group === "agents"}
                      className="rounded-xl border"
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full justify-between"
                        >
                          <span>
                            {t(`scopeGroups.${group}`)} · {scopes?.length ?? 0}
                          </span>
                          <ChevronDownIcon
                            data-icon="inline-end"
                            aria-hidden="true"
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="border-t p-3">
                        <div className="flex flex-col gap-3">
                          {(scopes ?? []).map((scope) => {
                            const checkboxId = `api-scope-${scope.permission}`;
                            return (
                              <Field
                                key={scope.permission}
                                orientation="horizontal"
                              >
                                <Checkbox
                                  id={checkboxId}
                                  checked={selectedScopes.includes(
                                    scope.permission,
                                  )}
                                  onCheckedChange={(checked) =>
                                    toggleScope(
                                      scope.permission,
                                      checked === true,
                                    )
                                  }
                                />
                                <FieldContent>
                                  <FieldLabel htmlFor={checkboxId}>
                                    <code className="text-xs">
                                      {scope.permission}
                                    </code>
                                  </FieldLabel>
                                  {scope.risk === "admin" ? (
                                    <Badge variant="outline" className="w-fit">
                                      {t("sensitiveScope")}
                                    </Badge>
                                  ) : null}
                                </FieldContent>
                              </Field>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              )}
            </fieldset>

            {selectedScopes.length === 0 ? (
              <p className="text-sm text-destructive" role="alert">
                {t("scopeRequired")}
              </p>
            ) : null}

            <Button
              className="self-start"
              disabled={
                creating ||
                loadError ||
                !name.trim() ||
                selectedScopes.length === 0
              }
              onClick={() => void createKey()}
            >
              {creating ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {t("createButton")}
            </Button>
          </div>

          {revealedKey ? (
            <div className="rounded-xl border border-warning/35 bg-warning/10 p-3 text-sm">
              <p className="font-medium">{t("copyTitle")}</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">
                  {revealedKey}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t("copyKey")}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(revealedKey)
                      .then(() => toast.success(t("copied")))
                      .catch(() => toast.error(t("copyFailed")));
                  }}
                >
                  <CopyIcon aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <Loader2
              className="mx-auto size-5 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : loadError ? (
            <div
              className="rounded-xl border border-destructive/25 bg-destructive/5 p-4"
              role="alert"
            >
              <p className="text-sm font-medium">{t("loadFailed")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("loadFailedDescription")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void load()}
              >
                {t("retry")}
              </Button>
            </div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="divide-y divide-border/70 rounded-xl border">
              {keys.map((key) => (
                <ApiKeyListItem
                  key={key.id}
                  apiKey={key}
                  locale={locale}
                  t={t}
                  onRevokeAction={setPendingRevoke}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <AlertDialog
        open={Boolean(pendingRevoke)}
        onOpenChange={(open) => {
          if (!open && !revoking) setPendingRevoke(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("revokeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("revokeDescription", {
                name: pendingRevoke?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>
              {t("cancelRevoke")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revoking || !pendingRevoke}
              onClick={(event) => {
                event.preventDefault();
                if (pendingRevoke) void revokeKey(pendingRevoke.id);
              }}
            >
              {revoking ? t("revoking") : t("revokeAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
