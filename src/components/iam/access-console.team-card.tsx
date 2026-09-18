"use client";

import type { ReactNode } from "react";
import { TeamEditDialog } from "./team-edit-dialog";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AccessMember, AccessTeam } from "./access-console.access-member";
import { ConfirmRemovalButton } from "./access-console.scope-path";

export function TeamCard({
  team,
  projectAccess,
  members,
  canManage,
  canDelete,
  pending,
  onAdd,
  onRemove,
  onDelete,
  onEdit,
}: {
  team: AccessTeam;
  projectAccess?: ReactNode;
  members: AccessMember[];
  canManage: boolean;
  canDelete: boolean;
  pending: string | null;
  onAdd: (userId: string) => Promise<boolean>;
  onRemove: (userId: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onEdit: (value: { name: string; description: string }) => Promise<boolean>;
}) {
  const t = useTranslations("access");
  return (
    <Card className="rounded-none border-0 border-b bg-transparent shadow-none">
      <CardHeader className="grid-cols-1! px-0 sm:grid-cols-[1fr_auto]!">
        <CardTitle className="break-words [overflow-wrap:anywhere]">
          {team.name}
        </CardTitle>
        <CardDescription>{team.description}</CardDescription>
        <CardAction className="col-start-1 row-start-auto flex flex-wrap items-center gap-2 sm:col-start-2 sm:row-start-1">
          <Badge variant="secondary">
            {t("memberCount", { count: team.members.length })}
          </Badge>
          {projectAccess}
          {canManage ? (
            <TeamEditDialog
              team={team}
              members={members}
              pending={pending}
              onSave={onEdit}
              onAdd={onAdd}
            />
          ) : null}
          {canDelete ? (
            <ConfirmRemovalButton
              pending={pending === `delete-team-${team.id}`}
              label={t("deleteTeam", { name: team.name })}
              title={t("deleteTeamTitle", { name: team.name })}
              description={t("deleteTeamDescription")}
              onConfirm={() => void onDelete()}
            />
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <details>
          <summary className="cursor-pointer py-2 text-sm text-muted-foreground">
            {t("simpleAccess.teamMembers")}
          </summary>
          <div className="flex flex-wrap gap-2 py-3">
            {team.members.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("emptyTeam")}</p>
            ) : (
              team.members.map((member) => (
                <span
                  key={member.id}
                  className="flex min-w-0 max-w-full items-center gap-0.5"
                >
                  <Badge
                    variant="outline"
                    className="min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere]"
                  >
                    {member.name}
                  </Badge>
                  {canManage ? (
                    <ConfirmRemovalButton
                      pending={
                        pending === `team-member-${team.id}-${member.userId}`
                      }
                      label={t("removeTeamMember", { name: member.name })}
                      title={t("removeTeamMemberTitle", {
                        name: member.name,
                      })}
                      description={t("removeTeamMemberDescription", {
                        team: team.name,
                      })}
                      onConfirm={() => void onRemove(member.userId)}
                    />
                  ) : null}
                </span>
              ))
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
