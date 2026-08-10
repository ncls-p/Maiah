import {
  AlertTriangleIcon,
  ArrowRightLeftIcon,
  CheckIcon,
  FolderKanbanIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
export function AccessPeopleBranch4({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {
    confirmSelectedMemberTransfer,
    filteredMemberTransferDestinations,
    memberTransferDestinations,
    memberTransferLoading,
    memberTransferMode,
    memberTransferOpen,
    memberTransferPreview,
    memberTransferQuery,
    memberTransferRoleId,
    memberTransferTargetId,
    openMemberTransfer,
    pendingAction,
    previewSelectedMemberTransfer,
    roleLabel,
    selectedMemberTransferDestination,
    selectedPeople,
    setAssignment,
    setAssignmentOpen,
    setBulkAssignmentIds,
    setMemberTransferMode,
    setMemberTransferOpen,
    setMemberTransferPreview,
    setMemberTransferQuery,
    setMemberTransferRoleId,
    setMemberTransferTargetId,
    t,
  } = model;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-sm text-muted-foreground">
        {t("selectedCount", { count: selectedPeople.length })}
      </span>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setBulkAssignmentIds(selectedPeople);
          setAssignment({
            principalType: "user",
            principalId: "",
            roleId: "",
            scopeType: "workspace",
          });
          setAssignmentOpen(true);
        }}
      >
        <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
        {t("grantSelected")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void openMemberTransfer()}
      >
        <ArrowRightLeftIcon data-icon="inline-start" aria-hidden="true" />
        {t("transferSelected")}
      </Button>
      <Dialog
        open={memberTransferOpen}
        onOpenChange={(open) => {
          setMemberTransferOpen(open);
          if (!open) setMemberTransferPreview(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("memberTransferTitle")}</DialogTitle>
            <DialogDescription>
              {t("memberTransferDescription", {
                count: selectedPeople.length,
              })}
            </DialogDescription>
          </DialogHeader>

          {memberTransferLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <Spinner />
            </div>
          ) : memberTransferDestinations.length === 0 ? (
            <Empty className="min-h-48 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderKanbanIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("noMemberTransferDestination")}</EmptyTitle>
                <EmptyDescription>
                  {t("noMemberTransferDestinationDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : memberTransferPreview ? (
            <div className="flex flex-col gap-4">
              <Alert
                variant={
                  memberTransferPreview.blockers.length > 0
                    ? "destructive"
                    : "default"
                }
              >
                {memberTransferPreview.blockers.length > 0 ? (
                  <AlertTriangleIcon aria-hidden="true" />
                ) : (
                  <CheckIcon aria-hidden="true" />
                )}
                <AlertTitle>
                  {memberTransferPreview.blockers.length > 0
                    ? t("memberTransferBlocked")
                    : t("memberTransferReady", {
                        count: memberTransferPreview.members.length,
                      })}
                </AlertTitle>
                <AlertDescription>
                  {memberTransferPreview.blockers.length > 0
                    ? memberTransferPreview.blockers.join(" ")
                    : t("memberTransferReadyDescription", {
                        project:
                          memberTransferPreview.destination.workspaceName,
                        organization:
                          memberTransferPreview.destination.organizationName,
                      })}
                </AlertDescription>
              </Alert>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="text-2xl font-semibold">
                    {memberTransferPreview.changes.destinationAssignmentsAdded}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("destinationAccessAdded")}
                  </div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-2xl font-semibold">
                    {memberTransferPreview.changes.sourceAssignmentsRemoved}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("sourceAccessRemoved")}
                  </div>
                </div>
                {memberTransferPreview.destination.crossOrganization ? (
                  <>
                    <div className="rounded-xl border p-4">
                      <div className="text-2xl font-semibold">
                        {
                          memberTransferPreview.changes
                            .destinationMembershipsAdded
                        }
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t("organizationMembershipsAdded")}
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="text-2xl font-semibold">
                        {
                          memberTransferPreview.changes
                            .sourceTeamMembershipsRemoved
                        }
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t("teamMembershipsRemoved")}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {memberTransferPreview.warnings.map((warning) => (
                <Alert key={warning}>
                  <AlertTriangleIcon aria-hidden="true" />
                  <AlertDescription>
                    {t(`memberTransferWarnings.${warning}`)}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          ) : (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="member-transfer-search">
                  {t("destinationProject")}
                </FieldLabel>
                <div className="relative">
                  <SearchIcon
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="member-transfer-search"
                    className="pl-9"
                    value={memberTransferQuery}
                    placeholder={t("searchProjects")}
                    onChange={(event) =>
                      setMemberTransferQuery(event.target.value)
                    }
                  />
                </div>
                <Select
                  value={memberTransferTargetId}
                  onValueChange={(value) => {
                    setMemberTransferTargetId(value);
                    setMemberTransferRoleId("");
                  }}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label={t("destinationProject")}
                  >
                    <SelectValue placeholder={t("chooseDestination")} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredMemberTransferDestinations.map((destination) => (
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

              <Field>
                <FieldLabel>{t("transferMode")}</FieldLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["add", "move"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`rounded-xl border p-4 text-left transition-colors ${memberTransferMode === mode ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                      onClick={() => setMemberTransferMode(mode)}
                    >
                      <span className="font-medium">
                        {t(
                          mode === "add"
                            ? "addToDestination"
                            : "moveToDestination",
                        )}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {t(
                          mode === "add"
                            ? "addToDestinationDescription"
                            : "moveToDestinationDescription",
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </Field>

              <Field>
                <FieldLabel>{t("destinationRole")}</FieldLabel>
                <Select
                  value={memberTransferRoleId}
                  disabled={!selectedMemberTransferDestination}
                  onValueChange={setMemberTransferRoleId}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label={t("destinationRole")}
                  >
                    <SelectValue placeholder={t("chooseRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedMemberTransferDestination?.roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {roleLabel(role.name, role.displayName)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {t("destinationRoleDescription")}
                </FieldDescription>
              </Field>
            </FieldGroup>
          )}

          <DialogFooter>
            {memberTransferPreview ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMemberTransferPreview(null)}
                >
                  {t("back")}
                </Button>
                <Button
                  type="button"
                  disabled={
                    memberTransferPreview.blockers.length > 0 ||
                    pendingAction === "executeMemberTransfer"
                  }
                  onClick={() => void confirmSelectedMemberTransfer()}
                >
                  {pendingAction === "executeMemberTransfer" ? (
                    <Spinner />
                  ) : (
                    <ArrowRightLeftIcon aria-hidden="true" />
                  )}
                  {t(
                    memberTransferMode === "add"
                      ? "confirmAddMembers"
                      : "confirmMoveMembers",
                  )}
                </Button>
              </>
            ) : memberTransferDestinations.length > 0 ? (
              <Button
                type="button"
                disabled={
                  !memberTransferTargetId ||
                  !memberTransferRoleId ||
                  pendingAction === "previewMemberTransfer"
                }
                onClick={() => void previewSelectedMemberTransfer()}
              >
                {pendingAction === "previewMemberTransfer" ? (
                  <Spinner />
                ) : (
                  <ShieldCheckIcon aria-hidden="true" />
                )}
                {t("reviewMemberTransfer")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
