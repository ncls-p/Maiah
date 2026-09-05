"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isPermissionCompatibleWithScope } from "@/modules/iam/permission-catalog";
import {
  expandPermissionGrants,
  matchesPermission,
} from "@/modules/iam/permission-matching";
import type { AccessSnapshot } from "./access-console.access-member";

export function RolePermissionPicker({
  catalog,
  selected,
  grantable,
  scope,
  readOnly,
  query,
  onQuery,
  onChange,
}: {
  catalog: AccessSnapshot["permissionCatalog"];
  selected: string[];
  grantable: Set<string>;
  scope: "organization" | "workspace";
  readOnly: boolean;
  query: string;
  onQuery: (value: string) => void;
  onChange: (permissions: string[]) => void;
}) {
  const t = useTranslations("access");
  const available = (id: string) =>
    isPermissionCompatibleWithScope(id, scope) && grantable.has(id);
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="permission-search">
          {t("searchPermissions")}
        </FieldLabel>
        <Input
          id="permission-search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
        />
        <FieldDescription>
          {t("permissionCount", { count: selected.length })}
        </FieldDescription>
      </Field>
      {catalog.map((group) => {
        const scoped = group.permissions.filter((permission) =>
          isPermissionCompatibleWithScope(permission.id, scope),
        );
        const visible = scoped.filter((permission) =>
          [
            permission.id,
            t(`permissions.${permission.id.replaceAll(".", "_")}.label`),
          ].some((value) =>
            value
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
          ),
        );
        if (!visible.length) return null;
        const eligible = visible.filter((permission) =>
          available(permission.id),
        );
        const all =
          eligible.length > 0 &&
          eligible.every((permission) => selected.includes(permission.id));
        return (
          <details
            key={`${group.id}-${Boolean(query)}`}
            open={query ? true : undefined}
            className="rounded-lg border p-3"
          >
            <summary className="cursor-pointer font-medium">
              {t(`permissionGroups.${group.id}.label`)}{" "}
              <span className="text-sm text-muted-foreground">
                (
                {
                  scoped.filter((permission) =>
                    selected.includes(permission.id),
                  ).length
                }
                /{scoped.length})
              </span>
            </summary>
            <div className="flex flex-col gap-3 pt-3">
              {!readOnly ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  disabled={!eligible.length}
                  onClick={() =>
                    onChange(
                      all
                        ? selected.filter(
                            (grant) =>
                              !eligible.some((permission) =>
                                matchesPermission(grant, permission.id),
                              ),
                          )
                        : expandPermissionGrants([
                            ...selected,
                            ...eligible.map((permission) => permission.id),
                          ]),
                    )
                  }
                >
                  {all ? t("clearGroup") : t("selectGroup")}
                </Button>
              ) : null}
              <FieldGroup>
                {visible.map((permission) => {
                  const checked = selected.includes(permission.id);
                  const disabled = readOnly || !available(permission.id);
                  return (
                    <Field
                      key={permission.id}
                      orientation="horizontal"
                      data-disabled={disabled}
                    >
                      <Checkbox
                        id={`permission-${permission.id}`}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(value) =>
                          onChange(
                            value
                              ? expandPermissionGrants([
                                  ...selected,
                                  permission.id,
                                ])
                              : selected.filter(
                                  (grant) =>
                                    !matchesPermission(grant, permission.id),
                                ),
                          )
                        }
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={`permission-${permission.id}`}>
                          {t(
                            `permissions.${permission.id.replaceAll(".", "_")}.label`,
                          )}
                        </FieldLabel>
                        <FieldDescription>
                          {t(
                            `permissions.${permission.id.replaceAll(".", "_")}.description`,
                          )}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  );
                })}
              </FieldGroup>
            </div>
          </details>
        );
      })}
    </div>
  );
}
