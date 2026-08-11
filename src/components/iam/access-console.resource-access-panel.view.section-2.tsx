import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
export function ResourceAccessPanelSection2({
  model,
}: {
  model: ResourceAccessPanelViewModel;
}) {
  const {
    assignResourceRole,
    assignmentQuery,
    details,
    detailsLoading,
    filteredGroupedAssignments,
    filteredPrincipals,
    includeDependencies,
    pending,
    principalIds,
    principalQuery,
    principalType,
    removeResourceAssignment,
    roleId,
    selected,
    setAssignmentQuery,
    setDetails,
    setIncludeDependencies,
    setPrincipalIds,
    setPrincipalQuery,
    setPrincipalType,
    setRoleId,
    setSelected,
    t,
  } = model;
  return (
    <Dialog
      open={Boolean(selected)}
      onOpenChange={(open) => {
        if (!open) {
          setSelected(null);
          setDetails(null);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {selected
              ? t("resourceAccessTitle", { name: selected.name })
              : t("resourceAccess")}
          </DialogTitle>
          <DialogDescription>
            {t("resourceAccessDescription")}
          </DialogDescription>
        </DialogHeader>
        {detailsLoading || !details ? (
          <div className="flex min-h-48 items-center justify-center">
            <Spinner />
            <span className="sr-only">{t("loadingResources")}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {details.capabilities.canManageResourceAccess ? (
              <form
                className="grid gap-3 rounded-xl bg-muted/35 p-4 md:grid-cols-3"
                onSubmit={assignResourceRole}
              >
                <Field>
                  <FieldLabel htmlFor="resource-principal-type">
                    {t("principalType")}
                  </FieldLabel>
                  <Select
                    value={principalType}
                    onValueChange={(value) => {
                      setPrincipalType(value as "user" | "group");
                      setPrincipalIds([]);
                    }}
                  >
                    <SelectTrigger
                      id="resource-principal-type"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">{t("member")}</SelectItem>
                      <SelectItem value="group">{t("team")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="resource-principal">
                    {t("principal")}
                  </FieldLabel>
                  <Input
                    value={principalQuery}
                    onChange={(event) => setPrincipalQuery(event.target.value)}
                    placeholder={t("searchPrincipal")}
                    aria-label={t("searchPrincipal")}
                    className="mb-2"
                  />
                  <div
                    id="resource-principal"
                    className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2"
                  >
                    {filteredPrincipals.map((principal) => {
                      const id =
                        "userId" in principal ? principal.userId : principal.id;
                      return (
                        <label
                          key={principal.id}
                          className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 hover:bg-muted"
                        >
                          <Checkbox
                            aria-label={principal.name}
                            checked={principalIds.includes(id)}
                            onCheckedChange={(checked) =>
                              setPrincipalIds((current) =>
                                checked
                                  ? [...new Set([...current, id])]
                                  : current.filter((value) => value !== id),
                              )
                            }
                          />
                          <span className="min-w-0 text-sm">
                            <span className="block truncate font-medium">
                              {principal.name}
                            </span>
                            {"email" in principal ? (
                              <span className="block truncate text-muted-foreground">
                                {principal.email}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="resource-role">{t("role")}</FieldLabel>
                  <Select value={roleId} onValueChange={setRoleId}>
                    <SelectTrigger id="resource-role" className="w-full">
                      <SelectValue placeholder={t("choose")} />
                    </SelectTrigger>
                    <SelectContent>
                      {details.roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {selected?.type === "agent" ? (
                  <label className="flex items-start gap-2 md:col-span-3">
                    <Checkbox
                      aria-label={t("shareAgentDependencies")}
                      checked={includeDependencies}
                      onCheckedChange={(checked) =>
                        setIncludeDependencies(Boolean(checked))
                      }
                    />
                    <span className="text-sm">
                      <span className="block font-medium">
                        {t("shareAgentDependencies")}
                      </span>
                      <span className="block text-muted-foreground">
                        {t("shareAgentDependenciesDescription")}
                      </span>
                    </span>
                  </label>
                ) : null}
                <Button
                  className="md:col-span-3 md:justify-self-end"
                  type="submit"
                  disabled={
                    principalIds.length === 0 || !roleId || pending === "assign"
                  }
                >
                  {pending === "assign" ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  {t("grantResourceAccess")}
                </Button>
              </form>
            ) : null}

            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-9"
                value={assignmentQuery}
                onChange={(event) => setAssignmentQuery(event.target.value)}
                placeholder={t("searchResourceAccess")}
                aria-label={t("searchResourceAccess")}
              />
            </div>

            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-left">
                <thead className="bg-muted/45 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("principal")}</th>
                    <th className="px-4 py-3 font-medium">{t("role")}</th>
                    <th className="px-4 py-3 font-medium">{t("scope")}</th>
                    <th className="px-4 py-3 text-right font-medium">
                      {t("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredGroupedAssignments.map(([principalKey, group]) => (
                    <tr key={principalKey}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{group.principalName}</div>
                        {group.principalDetail ? (
                          <div className="text-xs text-muted-foreground">
                            {group.principalDetail}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {group.assignments.map((assignment) => (
                            <Badge key={assignment.id} variant="outline">
                              {assignment.roleName}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {group.assignments.map((assignment) => (
                            <Badge
                              key={assignment.id}
                              variant={
                                assignment.scope === "resource"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {assignment.scope === "resource"
                                ? t("resourceScope")
                                : assignment.scope === "organization"
                                  ? t("organizationScope")
                                  : t("projectScope")}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {group.assignments.some(
                          (assignment) => assignment.scope === "resource",
                        ) && details.capabilities.canManageResourceAccess ? (
                          <div className="flex justify-end gap-1">
                            {group.assignments
                              .filter(
                                (assignment) => assignment.scope === "resource",
                              )
                              .map((assignment) => (
                                <Button
                                  key={assignment.id}
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={t("removeResourceRole", {
                                    role: assignment.roleName,
                                    name: assignment.principalName,
                                  })}
                                  disabled={pending === assignment.id}
                                  onClick={() =>
                                    void removeResourceAssignment(assignment.id)
                                  }
                                >
                                  {pending === assignment.id ? (
                                    <Spinner />
                                  ) : (
                                    <Trash2Icon aria-hidden="true" />
                                  )}
                                </Button>
                              ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t("inherited")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredGroupedAssignments.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                        colSpan={4}
                      >
                        {t("noResourceAccessResults")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
