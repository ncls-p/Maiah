import { useTranslations } from "next-intl";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { OpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import type { OpenAICompatibilityProfile } from "@/lib/openai-compatibility-profile";
import { OPENAI_COMPATIBILITY_PROFILE_LABELS } from "./constants";
import { EditProviderDialogProps } from "./provider-dialogs.add-provider-advanced-fields";
import { FIELD_STACK_CLASS } from "./provider-dialogs.field-stack-class";

export function EditProviderDialog({
  editingProvider,
  busy,
  editName,
  editBaseUrl,
  editApiKey,
  editApiRoute,
  editCompatibilityProfile,
  onClose,
  onNameChange,
  onBaseUrlChange,
  onApiKeyChange,
  onApiRouteChange,
  onCompatibilityProfileChange,
  onSave,
}: EditProviderDialogProps) {
  const t = useTranslations("providers.manager");
  const tCommon = useTranslations("common");
  return (
    <Dialog open={Boolean(editingProvider)} onOpenChange={onClose}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("editDialogDescription", { name: editingProvider?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className={FIELD_STACK_CLASS}>
            <Label htmlFor="edit-provider-name">{t("providerName")}</Label>
            <Input
              id="edit-provider-name"
              name="edit-provider-name"
              autoComplete="off"
              value={editName}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </div>
          <div className={FIELD_STACK_CLASS}>
            <Label htmlFor="edit-provider-url" help={t("serviceUrlHint")}>
              {t("serviceUrl")}
            </Label>
            <Input
              id="edit-provider-url"
              name="edit-provider-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              value={editBaseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("serviceUrlHint")}
            </p>
          </div>
          {editingProvider?.kind === "openai-compatible" ? (
            <div className={FIELD_STACK_CLASS}>
              <Label htmlFor="edit-provider-api-route" help={t("apiRouteHint")}>
                {t("apiRoute")}
              </Label>
              <Select
                value={editApiRoute}
                onValueChange={(value) =>
                  onApiRouteChange(value as OpenAICompatibleApiRoute)
                }
              >
                <SelectTrigger id="edit-provider-api-route">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="responses">
                      {t("apiRouteResponses")}
                    </SelectItem>
                    <SelectItem value="chat-completions">
                      {t("apiRouteChatCompletions")}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("apiRouteHint")}
              </p>
            </div>
          ) : null}
          {editingProvider?.kind === "openai-compatible" ? (
            <div className={FIELD_STACK_CLASS}>
              <Label
                htmlFor="edit-provider-compatibility-profile"
                help={t("compatibilityProfileHint")}
              >
                {t("compatibilityProfile")}
              </Label>
              <Select
                value={editCompatibilityProfile}
                onValueChange={(value) =>
                  onCompatibilityProfileChange(
                    value as OpenAICompatibilityProfile,
                  )
                }
              >
                <SelectTrigger id="edit-provider-compatibility-profile">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(OPENAI_COMPATIBILITY_PROFILE_LABELS).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("compatibilityProfileHint")}
              </p>
            </div>
          ) : null}
          <div className={FIELD_STACK_CLASS}>
            <Label htmlFor="edit-provider-key">
              {t("newApiKey")}{" "}
              <span className="text-muted-foreground">({t("optional")})</span>
            </Label>
            <Input
              id="edit-provider-key"
              name="edit-provider-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={editApiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={t("keepCurrentKey")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button disabled={busy} onClick={onSave}>
            {t("saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProviderDialog({
  deleteProviderId,
  busy,
  onClose,
  onDelete,
}: {
  deleteProviderId: string | null;
  busy: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("providers.manager");
  const tCommon = useTranslations("common");
  return (
    <AlertDialog open={Boolean(deleteProviderId)} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("archiveTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("archiveDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={() => deleteProviderId && onDelete(deleteProviderId)}
          >
            {t("archive")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteModelDialog({
  deleteModelId,
  deleteModelLabel,
  busy,
  onClose,
  onDelete,
}: {
  deleteModelId: string | null;
  deleteModelLabel: string | null;
  busy: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("providers.manager");
  const tCommon = useTranslations("common");
  return (
    <AlertDialog open={Boolean(deleteModelId)} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("removeModelTitle", { name: deleteModelLabel ?? "—" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("removeModelDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={() => deleteModelId && onDelete(deleteModelId)}
          >
            {t("remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
