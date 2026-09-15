"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
type Status = {
  enabled: boolean;
  clientId: string;
  scopes: string;
  dynamicRegistration: boolean;
  hasClientSecret: boolean;
  connected: boolean;
  needsReconnect: boolean;
  callbackUrl: string;
};
export function McpOAuthDialog({
  serverId,
  workspaceId,
  canEdit,
  open,
  onClose,
}: {
  serverId: string;
  workspaceId: string;
  canEdit: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("mcp.oauth");
  const [status, setStatus] = useState<Status | null>(null);
  const [secret, setSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const endpoint = `/api/workspace/mcp-servers/${serverId}/oauth?workspaceId=${workspaceId}`;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetchJson<Status>(endpoint, { signal: controller.signal })
      .then(setStatus)
      .catch(() => {
        if (!controller.signal.aborted) setError(t("failed"));
      });
    return () => controller.abort();
  }, [open, endpoint, t]);
  async function action(method: "PUT" | "POST" | "DELETE") {
    if (busy || !status) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchJson<{
        authorizationUrl?: string;
        revocation?: string;
      }>(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "PUT"
          ? {
              body: JSON.stringify({
                ...status,
                clientSecret: secret || undefined,
                clearSecret,
              }),
            }
          : {}),
      });
      if (result.authorizationUrl) {
        window.location.assign(result.authorizationUrl);
        return;
      }
      setStatus(await fetchJson<Status>(endpoint));
      setSecret("");
      setClearSecret(false);
      setNotice(
        method === "DELETE"
          ? t(
              result.revocation === "unavailable"
                ? "revocationUnavailable"
                : result.revocation === "not_supported"
                  ? "revocationUnsupported"
                  : "disconnected",
            )
          : t("saved"),
      );
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm">
            {notice}
          </p>
        ) : null}
        {!status ? (
          <p>{t("loading")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p role="status">
              {t(
                status.needsReconnect
                  ? "expired"
                  : status.connected
                    ? "connected"
                    : "notConnected",
              )}
            </p>
            {canEdit ? (
              <FieldGroup>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="mcp-oauth-enabled">
                    {t("enabled")}
                  </FieldLabel>
                  <Switch
                    id="mcp-oauth-enabled"
                    checked={status.enabled}
                    disabled={busy}
                    onCheckedChange={(enabled) =>
                      setStatus({ ...status, enabled })
                    }
                  />
                </Field>
                {status.enabled ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor="mcp-oauth-client">
                        {t("clientId")}
                      </FieldLabel>
                      <Input
                        id="mcp-oauth-client"
                        value={status.clientId}
                        disabled={busy}
                        onChange={(e) =>
                          setStatus({ ...status, clientId: e.target.value })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="mcp-oauth-secret">
                        {t("clientSecret")}
                      </FieldLabel>
                      <Input
                        id="mcp-oauth-secret"
                        type="password"
                        autoComplete="new-password"
                        value={secret}
                        disabled={busy}
                        onChange={(e) => setSecret(e.target.value)}
                      />
                      <FieldDescription>
                        {t(
                          status.hasClientSecret
                            ? "secretKept"
                            : "publicClient",
                        )}
                      </FieldDescription>
                    </Field>
                    {status.hasClientSecret ? (
                      <Field orientation="horizontal">
                        <FieldLabel htmlFor="mcp-oauth-clear">
                          {t("clearSecret")}
                        </FieldLabel>
                        <Switch
                          id="mcp-oauth-clear"
                          checked={clearSecret}
                          disabled={busy}
                          onCheckedChange={setClearSecret}
                        />
                      </Field>
                    ) : null}
                    <Field>
                      <FieldLabel htmlFor="mcp-oauth-scopes">
                        {t("scopes")}
                      </FieldLabel>
                      <Input
                        id="mcp-oauth-scopes"
                        value={status.scopes}
                        disabled={busy}
                        onChange={(e) =>
                          setStatus({ ...status, scopes: e.target.value })
                        }
                      />
                    </Field>
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="mcp-oauth-dcr">
                        {t("dynamic")}
                      </FieldLabel>
                      <Switch
                        id="mcp-oauth-dcr"
                        checked={status.dynamicRegistration}
                        disabled={busy}
                        onCheckedChange={(dynamicRegistration) =>
                          setStatus({ ...status, dynamicRegistration })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="mcp-oauth-callback">
                        {t("callback")}
                      </FieldLabel>
                      <Input
                        id="mcp-oauth-callback"
                        readOnly
                        value={status.callbackUrl}
                      />
                    </Field>
                  </>
                ) : null}
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => void action("PUT")}
                >
                  {t("save")}
                </Button>
                <FieldDescription>{t("saveHint")}</FieldDescription>
              </FieldGroup>
            ) : !status.enabled ? (
              <p>{t("adminRequired")}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !status.enabled}
                onClick={() => void action("POST")}
              >
                {t(status.connected ? "reconnect" : "connect")}
              </Button>
              {status.connected ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void action("DELETE")}
                >
                  {t("disconnect")}
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
