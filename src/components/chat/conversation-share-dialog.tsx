"use client";

import { CopyIcon, Globe2Icon, Share2Icon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type ShareRow = {
  userId: string;
  name: string;
  email: string;
  canContinue: boolean;
  continuationMode: "shared" | "fork";
};

type SharePayload = {
  shares: ShareRow[];
  publicShareId: string | null;
  isEphemeral: boolean;
};

export function ConversationShareDialog({ conversationId }: { conversationId: string }) {
  const t = useTranslations("chat.share");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [email, setEmail] = useState("");
  const [canContinue, setCanContinue] = useState(false);
  const [continuationMode, setContinuationMode] = useState<"shared" | "fork">(
    "fork",
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/workspace/conversations/${conversationId}/share`,
      );
      if (!response.ok) throw new Error(t("loadFailed"));
      setPayload((await response.json()) as SharePayload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [conversationId, t]);

  useEffect(() => {
    if (open) queueMicrotask(() => void load());
  }, [open, load]);

  async function addShare() {
    if (!email.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/workspace/conversations/${conversationId}/share`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetEmail: email.trim(),
            canContinue,
            continuationMode,
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) throw new Error(data?.error || t("saveFailed"));
      setEmail("");
      await load();
      toast.success(t("shared"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function removeShare(userId: string) {
    const response = await fetch(
      `/api/workspace/conversations/${conversationId}/share?userId=${userId}`,
      { method: "DELETE" },
    );
    if (!response.ok) return toast.error(t("removeFailed"));
    await load();
  }

  async function setPublic(nextPublic: boolean) {
    const response = await fetch(
      `/api/workspace/conversations/${conversationId}/share`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public: nextPublic }),
      },
    );
    if (!response.ok) return toast.error(t("publicFailed"));
    await load();
  }

  const publicUrl =
    payload?.publicShareId && typeof window !== "undefined"
      ? `${window.location.origin}/${locale}/share/${payload.publicShareId}`
      : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 rounded-xl"
          aria-label={t("action")}
        >
          <Share2Icon aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {loading && !payload ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("loading")}
          </p>
        ) : payload ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="conversation-share-email">
                {t("email")}
              </FieldLabel>
              <Input
                id="conversation-share-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("emailPlaceholder")}
              />
            </Field>
            <Field orientation="horizontal">
              <div className="flex-1">
                <FieldLabel htmlFor="conversation-can-continue">
                  {t("canContinue")}
                </FieldLabel>
                <FieldDescription>
                  {t("canContinueDescription")}
                </FieldDescription>
              </div>
              <Switch
                id="conversation-can-continue"
                checked={canContinue}
                onCheckedChange={setCanContinue}
              />
            </Field>
            {canContinue ? (
              <Field>
                <FieldLabel>{t("continuationMode")}</FieldLabel>
                <Select
                  value={continuationMode}
                  onValueChange={(value) =>
                    setContinuationMode(value as "shared" | "fork")
                  }
                >
                  <SelectTrigger aria-label={t("continuationMode")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="fork">{t("modeFork")}</SelectItem>
                      <SelectItem value="shared">{t("modeShared")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {t(
                    continuationMode === "shared"
                      ? "modeSharedDescription"
                      : "modeForkDescription",
                  )}
                </FieldDescription>
              </Field>
            ) : null}
            <Button
              type="button"
              disabled={saving || !email.trim()}
              onClick={() => void addShare()}
            >
              <Share2Icon data-icon="inline-start" aria-hidden="true" />
              {t("share")}
            </Button>
            {payload.shares.length ? (
              <div className="flex flex-col gap-2">
                {payload.shares.map((share) => (
                  <div
                    key={share.userId}
                    className="flex items-center gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {share.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {share.email} ·{" "}
                        {share.canContinue
                          ? t(
                              share.continuationMode === "shared"
                                ? "modeShared"
                                : "modeFork",
                            )
                          : t("readOnly")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("remove")}
                      onClick={() => void removeShare(share.userId)}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <Field
              orientation="horizontal"
              data-disabled={payload.isEphemeral || undefined}
            >
              <div className="flex-1">
                <FieldLabel htmlFor="conversation-public">
                  <Globe2Icon aria-hidden="true" />
                  {t("public")}
                </FieldLabel>
                <FieldDescription>
                  {payload.isEphemeral
                    ? t("ephemeralCannotShare")
                    : t("publicDescription")}
                </FieldDescription>
              </div>
              <Switch
                id="conversation-public"
                disabled={payload.isEphemeral}
                checked={Boolean(payload.publicShareId)}
                onCheckedChange={(checked) => void setPublic(checked)}
              />
            </Field>
            {publicUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(publicUrl)
                    .then(() => toast.success(t("copied")))
                }
              >
                <CopyIcon data-icon="inline-start" aria-hidden="true" />
                {t("copyPublicLink")}
              </Button>
            ) : null}
          </FieldGroup>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
