"use client";

import { SearchIcon, Share2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ResourceAccessScopePicker } from "@/components/agent-access-scope-picker";
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
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import type {
  ResourceAccessOptions,
  ResourceAccessScope,
  ResourceAccessSelection,
} from "@/modules/iam/resource-access-scope";

type ResourceType = "agent" | "knowledge_base" | "mcp_server";
type SharingMember = { id: string; name: string; email: string };

export function ResourceAccessDialog({
  open,
  workspaceId,
  resource,
  selection,
  options,
  includeDependencies = false,
  showScope = true,
  onOpenChangeAction,
  onScopeSaveAction,
  onSavedAction,
}: {
  open: boolean;
  workspaceId: string;
  resource: { id: string; name: string; type: ResourceType } | null;
  selection: ResourceAccessSelection;
  options: ResourceAccessOptions;
  includeDependencies?: boolean;
  showScope?: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onScopeSaveAction?: (selection: ResourceAccessSelection) => Promise<void>;
  onSavedAction?: () => void | Promise<void>;
}) {
  const t = useTranslations("resourceSharing");
  const [scope, setScope] = useState<ResourceAccessScope>(selection.scope);
  const [teamId, setTeamId] = useState(selection.teamId ?? "");
  const [members, setMembers] = useState<SharingMember[]>([]);
  const [sharedUserIds, setSharedUserIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingScope, setSavingScope] = useState(false);
  const [savingUsers, setSavingUsers] = useState(false);

  const loadSharing = useCallback(async () => {
    if (!resource) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        workspaceId,
        resourceType: resource.type,
        resourceId: resource.id,
      });
      const response = await fetch(
        `/api/workspace/iam/resource-sharing?${params}`,
      );
      const result = (await response.json().catch(() => ({}))) as {
        members?: SharingMember[];
        sharedUserIds?: string[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || t("loadFailed"));
      setMembers(result.members ?? []);
      setSharedUserIds(result.sharedUserIds ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [resource, t, workspaceId]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset dialog state for the selected resource
    setScope(selection.scope);
    setTeamId(selection.teamId ?? "");
    setQuery("");
    void loadSharing();
  }, [loadSharing, open, selection.scope, selection.teamId]);

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return members;
    return members.filter(({ name, email }) =>
      [name, email].some((value) =>
        value.toLocaleLowerCase().includes(normalized),
      ),
    );
  }, [members, query]);

  async function saveScope() {
    if (!onScopeSaveAction) return;
    setSavingScope(true);
    try {
      await onScopeSaveAction({
        scope,
        teamId: scope === "team" ? teamId : undefined,
      });
      toast.success(t("scopeSaved"));
      await onSavedAction?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setSavingScope(false);
    }
  }

  async function saveUsers() {
    if (!resource) return;
    setSavingUsers(true);
    try {
      const response = await fetch("/api/workspace/iam/resource-sharing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          resourceType: resource.type,
          resourceId: resource.id,
          userIds: sharedUserIds,
          includeDependencies,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || t("saveFailed"));
      toast.success(t("usersSaved"));
      await loadSharing();
      await onSavedAction?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setSavingUsers(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("title", { name: resource?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <FieldGroup>
          {showScope ? (
            <Field>
              <FieldLabel>{t("scopeTitle")}</FieldLabel>
              <FieldDescription>{t("scopeDescription")}</FieldDescription>
              <ResourceAccessScopePicker
                value={scope}
                teamId={teamId}
                options={options}
                copyNamespace="resourceAccessScope"
                onChangeAction={(nextScope, nextTeamId) => {
                  setScope(nextScope);
                  setTeamId(nextTeamId ?? "");
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={savingScope || (scope === "team" && !teamId)}
                onClick={() => void saveScope()}
              >
                {savingScope ? <Spinner data-icon="inline-start" /> : null}
                {t("saveScope")}
              </Button>
            </Field>
          ) : null}

          <Field>
            <FieldLabel>{t("peopleTitle")}</FieldLabel>
            <FieldDescription>
              {includeDependencies
                ? t("peopleAgentDescription")
                : t("peopleDescription")}
            </FieldDescription>
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-9"
                value={query}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchLabel")}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <ScrollArea className="h-56 rounded-lg border">
              {loading ? (
                <div className="flex h-full items-center justify-center p-6">
                  <Spinner />
                  <span className="sr-only">{t("loading")}</span>
                </div>
              ) : filteredMembers.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {query ? t("noResults") : t("noMembers")}
                </p>
              ) : (
                <div className="flex flex-col gap-1 p-2">
                  {filteredMembers.map((member) => {
                    const checked = sharedUserIds.includes(member.id);
                    const checkboxId = `share-member-${member.id}`;
                    return (
                      <Field
                        key={member.id}
                        orientation="horizontal"
                        className="rounded-md p-2 hover:bg-muted/50"
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={checked}
                          onCheckedChange={(nextChecked) =>
                            setSharedUserIds((current) =>
                              nextChecked === true
                                ? [...new Set([...current, member.id])]
                                : current.filter((id) => id !== member.id),
                            )
                          }
                        />
                        <FieldContent>
                          <FieldLabel htmlFor={checkboxId}>
                            {member.name}
                          </FieldLabel>
                          <FieldDescription>{member.email}</FieldDescription>
                        </FieldContent>
                      </Field>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChangeAction(false)}
          >
            {t("close")}
          </Button>
          <Button
            type="button"
            disabled={loading || savingUsers}
            onClick={() => void saveUsers()}
          >
            {savingUsers ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Share2Icon data-icon="inline-start" />
            )}
            {t("savePeople")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
