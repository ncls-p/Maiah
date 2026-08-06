import { CopyIcon,PlusIcon,SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardAction,CardDescription,CardHeader,CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,DialogTrigger } from "@/components/ui/dialog";
import { Field,FieldContent,FieldDescription,FieldGroup,FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isPermissionCompatibleWithScope } from "@/modules/iam/permission-catalog";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { INITIAL_ROLE_FORM } from "./access-console.resource-transfer-preview";
import { MutatingButton } from "./access-console.scope-path";
export function AccessRolesSection2({ model }: { model: AccessConsoleViewModel }) {
  const { canCustomizeViewedRole, canDelegateViewedRole, canManageOrganizationAccess, canManageProjectAccess, editingRoleId, grantablePermissionSet, mutate, pendingAction, permissionQuery, roleEditorReadOnly, roleForm, roleOpen, setEditingRoleId, setPermissionQuery, setRoleEditorReadOnly, setRoleForm, setRoleOpen, snapshot, t, workspaceId } = model;
  return (
    <CardHeader>
      <CardTitle>{t("rolesTitle")}</CardTitle>
      <CardDescription>{t("rolesDescription")}</CardDescription>
      {canManageProjectAccess || canManageOrganizationAccess ? (
        <CardAction>
          <Dialog
            open={roleOpen}
            onOpenChange={(open) => {
              setRoleOpen(open);
              if (open && !canManageOrganizationAccess) {
                setRoleForm((current) => ({
                  ...current,
                  scopeType: "workspace",
                  permissions: current.permissions.filter((permission) => isPermissionCompatibleWithScope(permission, "workspace")),
                }));
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditingRoleId(null);
                  setRoleEditorReadOnly(false);
                  setRoleForm(INITIAL_ROLE_FORM);
                  setPermissionQuery("");
                }}
              >
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
                {t("createRole")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[min(46rem,calc(100vh-2rem))] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {roleEditorReadOnly
                    ? t("viewRoleTitle", {
                        name: roleForm.displayName,
                      })
                    : editingRoleId
                      ? t("editRoleTitle", {
                          name: roleForm.displayName,
                        })
                      : t("createRoleTitle")}
                </DialogTitle>
                <DialogDescription>{roleEditorReadOnly ? t("builtInRoleDescription") : editingRoleId ? t("editRoleDescription") : t("createRoleDescription")}</DialogDescription>
              </DialogHeader>
              <form
                className="contents"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const saved = await mutate(
                    editingRoleId ? "updateRole" : "createRole",
                    editingRoleId
                      ? {
                          action: "updateRole",
                          workspaceId,
                          roleId: editingRoleId,
                          displayName: roleForm.displayName,
                          description: roleForm.description,
                          permissions: roleForm.permissions,
                        }
                      : {
                          action: "createRole",
                          workspaceId,
                          ...roleForm,
                        },
                    editingRoleId ? t("roleUpdated") : t("roleCreated"),
                    { close: () => setRoleOpen(false) },
                  );
                  if (saved) {
                    setEditingRoleId(null);
                    setRoleForm(INITIAL_ROLE_FORM);
                  }
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="role-name">{t("roleName")}</FieldLabel>
                    <Input
                      id="role-name"
                      disabled={roleEditorReadOnly}
                      required
                      minLength={2}
                      value={roleForm.displayName}
                      onChange={(event) =>
                        setRoleForm({
                          ...roleForm,
                          displayName: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="role-description">{t("descriptionLabel")}</FieldLabel>
                    <Textarea
                      id="role-description"
                      disabled={roleEditorReadOnly}
                      value={roleForm.description}
                      onChange={(event) =>
                        setRoleForm({
                          ...roleForm,
                          description: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="custom-role-scope">{t("roleScope")}</FieldLabel>
                    <Select
                      disabled={Boolean(editingRoleId)}
                      value={roleForm.scopeType}
                      onValueChange={(value) =>
                        setRoleForm({
                          ...roleForm,
                          scopeType: value as "organization" | "workspace",
                          permissions: roleForm.permissions.filter((permission) => isPermissionCompatibleWithScope(permission, value as "organization" | "workspace") && snapshot.grantablePermissions[value as "organization" | "workspace"].includes(permission)),
                        })
                      }
                    >
                      <SelectTrigger id="custom-role-scope" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="workspace">{t("projectRole")}</SelectItem>
                          {canManageOrganizationAccess ? <SelectItem value="organization">{t("organizationRole")}</SelectItem> : null}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="permission-search">{t("searchPermissions")}</FieldLabel>
                    <div className="relative">
                      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <Input id="permission-search" className="pl-9" value={permissionQuery} placeholder={t("searchPlaceholder")} onChange={(event) => setPermissionQuery(event.target.value)} />
                    </div>
                  </Field>
                  <div className="flex flex-col gap-4">
                    {snapshot.permissionCatalog.map((group) => {
                      const visiblePermissions = group.permissions.filter((permission) => [t(`permissions.${permission.id.replaceAll(".", "_")}.label`), t(`permissions.${permission.id.replaceAll(".", "_")}.description`), permission.id].some((value) => value.toLocaleLowerCase().includes(permissionQuery.trim().toLocaleLowerCase())));
                      if (visiblePermissions.length === 0) return null;
                      const compatiblePermissions = visiblePermissions.filter((permission) => isPermissionCompatibleWithScope(permission.id, roleForm.scopeType) && grantablePermissionSet.has(permission.id));
                      const allSelected = compatiblePermissions.length > 0 && compatiblePermissions.every((permission) => roleForm.permissions.includes(permission.id));
                      return (
                        <fieldset key={group.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4">
                          <legend className="flex w-full items-center justify-between gap-3 px-1 font-semibold">
                            <span>{t(`permissionGroups.${group.id}.label`)}</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={roleEditorReadOnly}
                              onClick={() =>
                                setRoleForm((current) => ({
                                  ...current,
                                  permissions: allSelected ? current.permissions.filter((permission) => !compatiblePermissions.some((item) => item.id === permission)) : [...new Set([...current.permissions, ...compatiblePermissions.map((permission) => permission.id)])],
                                }))
                              }
                            >
                              {allSelected ? t("clearGroup") : t("selectGroup")}
                            </Button>
                          </legend>
                          <p className="text-sm text-muted-foreground">{t(`permissionGroups.${group.id}.description`)}</p>
                          <FieldGroup data-slot="checkbox-group">
                            {visiblePermissions.map((permission) => {
                              const checked = roleForm.permissions.includes(permission.id);
                              const compatible = isPermissionCompatibleWithScope(permission.id, roleForm.scopeType);
                              const grantable = grantablePermissionSet.has(permission.id);
                              return (
                                <Field key={permission.id} orientation="horizontal" data-disabled={!compatible}>
                                  <Checkbox
                                    id={`permission-${permission.id}`}
                                    checked={checked}
                                    disabled={roleEditorReadOnly || !compatible || (!checked && !grantable)}
                                    onCheckedChange={(nextChecked) =>
                                      setRoleForm((current) => ({
                                        ...current,
                                        permissions: nextChecked ? [...current.permissions, permission.id] : current.permissions.filter((item) => item !== permission.id),
                                      }))
                                    }
                                  />
                                  <FieldContent>
                                    <FieldLabel htmlFor={`permission-${permission.id}`}>{t(`permissions.${permission.id.replaceAll(".", "_")}.label`)}</FieldLabel>
                                    <FieldDescription>{t(`permissions.${permission.id.replaceAll(".", "_")}.description`)}</FieldDescription>
                                  </FieldContent>
                                </Field>
                              );
                            })}
                          </FieldGroup>
                        </fieldset>
                      );
                    })}
                  </div>
                </FieldGroup>
                <DialogFooter className="sticky bottom-0">
                  {roleEditorReadOnly && canCustomizeViewedRole && canDelegateViewedRole ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setRoleEditorReadOnly(false);
                        setEditingRoleId(null);
                        setRoleForm((current) => ({
                          ...current,
                          displayName: t("roleCopyName", {
                            name: current.displayName,
                          }),
                        }));
                      }}
                    >
                      <CopyIcon data-icon="inline-start" aria-hidden="true" />
                      {t("duplicateAndCustomize")}
                    </Button>
                  ) : roleEditorReadOnly ? null : (
                    <MutatingButton pending={pendingAction === (editingRoleId ? "updateRole" : "createRole")}>{editingRoleId ? t("saveRole") : t("createRole")}</MutatingButton>
                  )}
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardAction>
      ) : null}
    </CardHeader>
  );
}
