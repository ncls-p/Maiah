import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Globe,Share2,Star,User,Users } from "lucide-react";
import { getVisibilityHint,getVisibilityLabel } from "./marketplace-i18n-helpers";
import { PublishPreviewSummary } from "./publish-preview-summary";
import type { useResourceShareDialogController } from "./resource-share-dialog.resource-share-dialog";
import { STEP_INDEX,ShareOptionCard } from "./resource-share-dialog.share-step";

type Model = Extract<ReturnType<typeof useResourceShareDialogController>, { kind: "ready" }>;
export function ResourceShareDialogView({ model }: { model: Model }) {
  const { busy, description, filteredUsers, handlePublishToMarketplace, handleShareWithUser, loadUsers, name, onCloseAction, open, preview, previewLoading, resource, resourceSubjectKey, search, selectedUserId, setDescription, setName, setSearch, setSelectedUserId, setStep, setTagsInput, setVisibility, step, t, tCommon, tVisibility, tagsInput, visibility } = model;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCloseAction()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-4" />
            {t("title", { name: resource.name })}
          </DialogTitle>
          <DialogDescription>
            {t(`steps.${step}`)}
            {resource.kind !== "marketplace_item" && step === "choose" ? ` ${t(`resourceSubject.${resourceSubjectKey}`)}` : ""}
          </DialogDescription>
          <p className="text-xs text-muted-foreground">
            {t("stepIndicator", {
              current: STEP_INDEX[step],
              total: 2,
            })}
          </p>
        </DialogHeader>

        {previewLoading && step === "meta" ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-6" />
          </div>
        ) : null}

        {step === "meta" && !previewLoading ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="share-name">{t("fields.name")}</Label>
              <Input id="share-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="share-desc">{t("fields.description")}</Label>
              <Textarea id="share-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("fields.visibility")}</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as "public" | "private")}>
                <SelectTrigger aria-label={t("fields.visibility")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["public", "private"] as const).map((v) => (
                    <SelectItem key={v} value={v}>
                      {getVisibilityLabel(v, (key) => tVisibility(key as "visibility.public"))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getVisibilityHint(visibility, (key) => tVisibility(key as "visibility.publicHint")) ? <p className="text-xs text-muted-foreground">{getVisibilityHint(visibility, (key) => tVisibility(key as "visibility.publicHint"))}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="share-tags">{t("fields.tags")}</Label>
              <Input id="share-tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
            </div>
            {preview?.manifestPreview ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium">{t("contentPreview")}</p>
                <PublishPreviewSummary preview={preview.manifestPreview} />
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "choose" ? (
          <div className="grid gap-3">
            <ShareOptionCard icon={Globe} title={t("options.publish.title")} description={t("options.publish.description")} onClick={() => setStep("meta")} disabled={busy} />
            <ShareOptionCard
              icon={Users}
              title={t("options.user.title")}
              description={t("options.user.description")}
              onClick={() => {
                void loadUsers().then(() => setStep("user"));
              }}
              disabled={busy}
            />
          </div>
        ) : null}

        {step === "user" ? (
          <div className="space-y-3">
            <Input aria-label={t("searchUser")} placeholder={t("searchUser")} value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/70 p-1">
              {filteredUsers.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t("noUsers")}</p>
              ) : (
                filteredUsers.map((user) => (
                  <button key={user.id} type="button" className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm", selectedUserId === user.id ? "bg-primary/10 font-medium" : "hover:bg-muted")} onClick={() => setSelectedUserId(selectedUserId === user.id ? "" : user.id)}>
                    <span className="truncate">
                      {user.name} <span className="text-muted-foreground">({user.email})</span>
                    </span>
                    {selectedUserId === user.id ? <Star className="size-3 shrink-0 fill-primary text-primary" /> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "meta" ? (
            <>
              <Button variant="outline" onClick={() => setStep("choose")} disabled={busy}>
                {tCommon("back")}
              </Button>
              <Button disabled={!name.trim() || busy} onClick={() => void handlePublishToMarketplace()}>
                {busy ? <Spinner className="size-4 mr-1" /> : null}
                <Globe className="size-4 mr-1" />
                {t("publish")}
              </Button>
            </>
          ) : null}
          {step === "choose" ? (
            <Button variant="outline" onClick={onCloseAction} disabled={busy}>
              {tCommon("cancel")}
            </Button>
          ) : null}
          {step === "user" ? (
            <>
              <Button variant="outline" onClick={() => setStep("choose")} disabled={busy}>
                {tCommon("back")}
              </Button>
              <Button disabled={!selectedUserId || busy} onClick={() => void handleShareWithUser()}>
                {busy ? <Spinner className="size-4 mr-1" /> : null}
                <User className="size-4 mr-1" />
                {t("action")}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
