import {
  ArrowRightLeftIcon,
  BoxesIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { ResourceAccessPanelViewModel } from "./access-console.resource-access-panel.view";
export function ResourceAccessPanelSection4({
  model,
}: {
  model: ResourceAccessPanelViewModel;
}) {
  const {
    canManageResources,
    definitions,
    loadDetails,
    loadResources,
    loadingMoreResources,
    loadingResources,
    nextResourceOffset,
    openTransfer,
    query,
    resourceType,
    resources,
    setAssignmentQuery,
    setDeletingResource,
    setDetails,
    setNextResourceOffset,
    setPrincipalIds,
    setQuery,
    setResourceType,
    setResources,
    setRoleId,
    setSelected,
    t,
  } = model;
  return (
    <CardContent className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[15rem_minmax(16rem,1fr)]">
        <Field>
          <FieldLabel htmlFor="resource-type">{t("resourceType")}</FieldLabel>
          <Select
            value={resourceType}
            onValueChange={(value) => {
              setResourceType(value);
              setResources([]);
              setNextResourceOffset(null);
            }}
          >
            <SelectTrigger id="resource-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {definitions.map((definition) => (
                  <SelectItem key={definition.type} value={definition.type}>
                    {t(`resourceTypes.${definition.type}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="resource-search">
            {t("searchResources")}
          </FieldLabel>
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="resource-search"
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchResourcesPlaceholder")}
            />
          </div>
        </Field>
      </div>

      {loadingResources ? (
        <div className="flex min-h-40 items-center justify-center">
          <Spinner />
          <span className="sr-only">{t("loadingResources")}</span>
        </div>
      ) : resources.length === 0 ? (
        <Empty className="min-h-48 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("noResources")}</EmptyTitle>
            <EmptyDescription>{t("noResourcesDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left">
            <thead className="bg-muted/45 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("resource")}</th>
                <th className="px-4 py-3 text-right font-medium">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {resources.map((resource) => (
                <tr key={resource.id} className="hover:bg-muted/25">
                  <td className="px-4 py-3">
                    <span className="font-medium">{resource.name}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {canManageResources ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void openTransfer(resource)}
                        >
                          <ArrowRightLeftIcon
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                          {t("transfer")}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(resource);
                          setDetails(null);
                          setPrincipalIds([]);
                          setRoleId("");
                          setAssignmentQuery("");
                          void loadDetails(resource);
                        }}
                      >
                        <ShieldCheckIcon
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        {t("manageResourceAccess")}
                      </Button>
                      {canManageResources ? (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          aria-label={t("deleteResource", {
                            name: resource.name,
                          })}
                          onClick={() => setDeletingResource(resource)}
                        >
                          <Trash2Icon aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nextResourceOffset !== null ? (
            <div className="flex justify-center border-t bg-muted/15 p-3">
              <Button
                type="button"
                variant="outline"
                disabled={loadingMoreResources}
                onClick={() => void loadResources(nextResourceOffset)}
              >
                {loadingMoreResources ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                {t("loadMoreResources")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </CardContent>
  );
}
