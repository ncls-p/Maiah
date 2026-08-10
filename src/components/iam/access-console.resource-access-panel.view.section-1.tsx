import {
  AlertTriangleIcon,
  ArrowRightLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  FolderKanbanIcon,
  SearchIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { ResourceAccessPanelViewModel } from "./access-console.resource-access-panel.view";
import { ResourceTransferOptions } from "./access-console.resource-transfer-preview";
export function ResourceAccessPanelSection1({
  model,
}: {
  model: ResourceAccessPanelViewModel;
}) {
  const {
    advancedTransfer,
    destinationQuery,
    executeTransfer,
    filteredDestinations,
    organizationId,
    previewTransfer,
    setAdvancedTransfer,
    setDestinationQuery,
    setTargetWorkspaceId,
    setTransferOptions,
    setTransferPreview,
    setTransferResource,
    t,
    targetWorkspaceId,
    transferDestinations,
    transferItemsByType,
    transferLoading,
    transferOptions,
    transferPreview,
    transferResource,
  } = model;
  return (
    <Dialog
      open={Boolean(transferResource)}
      onOpenChange={(open) => {
        if (!open && !transferLoading) {
          setTransferResource(null);
          setTransferPreview(null);
        }
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {transferResource
              ? t("transferTitle", { name: transferResource.name })
              : t("transfer")}
          </DialogTitle>
          <DialogDescription>{t("transferDescription")}</DialogDescription>
        </DialogHeader>

        {transferLoading && transferDestinations.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center">
            <Spinner />
            <span className="sr-only">{t("loadingDestinations")}</span>
          </div>
        ) : transferDestinations.length === 0 ? (
          <Empty className="min-h-44 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderKanbanIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("noTransferDestination")}</EmptyTitle>
              <EmptyDescription>
                {t("noTransferDestinationDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
              <Field>
                <FieldLabel htmlFor="transfer-destination-search">
                  {t("destinationProject")}
                </FieldLabel>
                <div className="relative">
                  <SearchIcon
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="transfer-destination-search"
                    className="pl-9"
                    value={destinationQuery}
                    onChange={(event) => {
                      setDestinationQuery(event.target.value);
                      setTransferPreview(null);
                    }}
                    placeholder={t("searchDestination")}
                  />
                </div>
                <Select
                  value={targetWorkspaceId}
                  onValueChange={(value) => {
                    setTargetWorkspaceId(value);
                    const destination = transferDestinations.find(
                      (candidate) => candidate.workspaceId === value,
                    );
                    const changesOrganization =
                      destination?.organizationId !== organizationId;
                    setTransferOptions((current) => ({
                      ...current,
                      ownershipPolicy: changesOrganization
                        ? "actor"
                        : "preserve",
                      secretPolicy: changesOrganization ? "disable" : "keep",
                    }));
                    setTransferPreview(null);
                  }}
                >
                  <SelectTrigger
                    id="transfer-destination"
                    className="w-full"
                    aria-label={t("destinationProject")}
                  >
                    <SelectValue placeholder={t("chooseDestination")} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredDestinations.map((destination) => (
                      <SelectItem
                        key={destination.workspaceId}
                        value={destination.workspaceId}
                      >
                        {destination.organizationName} ·{" "}
                        {destination.workspaceName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3">
                <Checkbox
                  aria-label={t("includeDependencies")}
                  checked={transferOptions.includeDependencies}
                  onCheckedChange={(checked) => {
                    setTransferOptions((current) => ({
                      ...current,
                      includeDependencies: checked === true,
                    }));
                    setTransferPreview(null);
                  }}
                />
                <span className="grid gap-1">
                  <span className="text-sm font-medium">
                    {t("includeDependencies")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("includeDependenciesDescription")}
                  </span>
                </span>
              </label>

              <Button
                type="button"
                variant="ghost"
                className="justify-start"
                onClick={() => setAdvancedTransfer((value) => !value)}
              >
                {advancedTransfer ? (
                  <ChevronRightIcon
                    className="rotate-90"
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronRightIcon
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                )}
                {t("advancedTransferOptions")}
              </Button>

              {advancedTransfer ? (
                <div className="grid gap-3 border-t pt-4 md:grid-cols-3">
                  <Field>
                    <FieldLabel htmlFor="transfer-access-policy">
                      {t("directAccessPolicy")}
                    </FieldLabel>
                    <Select
                      value={transferOptions.accessPolicy}
                      onValueChange={(value) => {
                        setTransferOptions((current) => ({
                          ...current,
                          accessPolicy:
                            value as ResourceTransferOptions["accessPolicy"],
                        }));
                        setTransferPreview(null);
                      }}
                    >
                      <SelectTrigger
                        id="transfer-access-policy"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="compatible">
                          {t("keepCompatibleAccess")}
                        </SelectItem>
                        <SelectItem value="remove_all">
                          {t("removeAllDirectAccess")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="transfer-ownership-policy">
                      {t("ownershipPolicy")}
                    </FieldLabel>
                    <Select
                      value={transferOptions.ownershipPolicy}
                      onValueChange={(value) => {
                        setTransferOptions((current) => ({
                          ...current,
                          ownershipPolicy:
                            value as ResourceTransferOptions["ownershipPolicy"],
                        }));
                        setTransferPreview(null);
                      }}
                    >
                      <SelectTrigger
                        id="transfer-ownership-policy"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="actor">
                          {t("reassignOwnership")}
                        </SelectItem>
                        <SelectItem value="preserve">
                          {t("preserveOwnership")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="transfer-secret-policy">
                      {t("secretPolicy")}
                    </FieldLabel>
                    <Select
                      value={transferOptions.secretPolicy}
                      onValueChange={(value) => {
                        setTransferOptions((current) => ({
                          ...current,
                          secretPolicy:
                            value as ResourceTransferOptions["secretPolicy"],
                        }));
                        setTransferPreview(null);
                      }}
                    >
                      <SelectTrigger
                        id="transfer-secret-policy"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="disable">
                          {t("disableSecrets")}
                        </SelectItem>
                        <SelectItem value="keep">{t("keepSecrets")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              ) : null}
            </div>

            {transferPreview ? (
              <div className="flex flex-col gap-4">
                <Alert
                  variant={
                    transferPreview.blockers.length > 0
                      ? "destructive"
                      : "default"
                  }
                >
                  {transferPreview.blockers.length > 0 ? (
                    <AlertTriangleIcon aria-hidden="true" />
                  ) : (
                    <CheckIcon aria-hidden="true" />
                  )}
                  <AlertTitle>
                    {transferPreview.blockers.length > 0
                      ? t("transferBlocked")
                      : t("transferReady", {
                          count: transferPreview.items.length,
                        })}
                  </AlertTitle>
                  <AlertDescription>
                    {transferPreview.crossOrganization
                      ? t("crossOrganizationTransfer")
                      : t("sameOrganizationTransfer")}
                  </AlertDescription>
                </Alert>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">
                      {t("resources")}
                    </div>
                    <div className="text-xl font-semibold">
                      {transferPreview.items.length}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">
                      {t("directAssignments")}
                    </div>
                    <div className="text-sm font-medium">
                      {t("keptAndRemoved", {
                        kept: transferPreview.directAssignments.kept,
                        removed: transferPreview.directAssignments.removed,
                      })}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">
                      {t("connections")}
                    </div>
                    <div className="text-sm font-medium">
                      {t("affectedConnections", {
                        count: transferPreview.secrets.affected,
                      })}
                    </div>
                  </div>
                </div>

                <div className="max-h-56 overflow-auto rounded-xl border">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">
                          {t("resourceType")}
                        </th>
                        <th className="px-4 py-3 font-medium">
                          {t("resource")}
                        </th>
                        <th className="px-4 py-3 font-medium">
                          {t("transferReason")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {transferItemsByType.flatMap(([type, items]) =>
                        items.map((item) => (
                          <tr key={`${item.type}:${item.id}`}>
                            <td className="px-4 py-3 text-sm">
                              {t(`resourceTypes.${type}`)}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium">
                              {item.name}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {t(`transferReasons.${item.reason}`)}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>

                {[...transferPreview.blockers, ...transferPreview.warnings]
                  .length > 0 ? (
                  <ul className="grid gap-2 text-sm text-muted-foreground">
                    {transferPreview.blockers.map((message) => (
                      <li
                        key={`blocker-${message}`}
                        className="text-destructive"
                      >
                        • {message}
                      </li>
                    ))}
                    {transferPreview.warnings.map((message) => (
                      <li key={`warning-${message}`}>• {message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="sticky -bottom-6 z-10 -mx-6 -mb-6 border-t bg-background px-6 pt-4 pb-6">
          <Button
            type="button"
            variant="outline"
            disabled={transferLoading}
            onClick={() => {
              setTransferResource(null);
              setTransferPreview(null);
            }}
          >
            {t("cancelTransfer")}
          </Button>
          {transferPreview ? (
            <Button
              type="button"
              disabled={transferLoading || transferPreview.blockers.length > 0}
              onClick={() => void executeTransfer()}
            >
              {transferLoading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <ArrowRightLeftIcon
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              )}
              {t("confirmTransfer")}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!targetWorkspaceId || transferLoading}
              onClick={() => void previewTransfer()}
            >
              {transferLoading ? <Spinner data-icon="inline-start" /> : null}
              {t("previewTransfer")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
