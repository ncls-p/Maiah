"use client";
import { type FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { PencilIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  AccessMember,
  AccessTeam,
} from "./access-console.access-member";
import { MutatingButton } from "./access-console.scope-path";

export function TeamEditDialog({
  team,
  members,
  pending,
  onSave,
  onAdd,
}: {
  team: AccessTeam;
  members: AccessMember[];
  pending: string | null;
  onSave: (value: { name: string; description: string }) => Promise<boolean>;
  onAdd: (userId: string) => Promise<boolean>;
}) {
  const t = useTranslations("access");
  const busy = Boolean(pending);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");
  const [userId, setUserId] = useState("");
  const availableMembers = members.filter(
    (member) =>
      !team.members.some((teamMember) => teamMember.userId === member.userId),
  );

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    if (await onAdd(userId)) setUserId("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          if (value) {
            setName(team.name);
            setDescription(team.description ?? "");
            setUserId("");
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          <PencilIcon data-icon="inline-start" />
          {t("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("simpleAccess.editTeam")}</DialogTitle>
          <DialogDescription>
            {t("simpleAccess.editTeamDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!busy && (await onSave({ name, description }))) setOpen(false);
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`edit-team-name-${team.id}`}>
                {t("teamName")}
              </FieldLabel>
              <Input
                id={`edit-team-name-${team.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={255}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`edit-team-description-${team.id}`}>
                {t("descriptionLabel")}
              </FieldLabel>
              <Textarea
                id={`edit-team-description-${team.id}`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                disabled={busy}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t("simpleAccess.cancel")}
            </Button>
            <MutatingButton pending={busy}>
              {t("simpleAccess.save")}
            </MutatingButton>
          </DialogFooter>
        </form>
        {availableMembers.length > 0 ? (
          <form
            className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end"
            onSubmit={addMember}
          >
            <Field className="flex-1">
              <FieldLabel htmlFor={`team-member-${team.id}`}>
                {t("addTeamMember")}
              </FieldLabel>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger
                  id={`team-member-${team.id}`}
                  className="w-full"
                >
                  <SelectValue placeholder={t("chooseMember")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {availableMembers.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Button
              type="submit"
              disabled={!userId || busy}
            >
              {pending === `team-${team.id}` ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {t("add")}
            </Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
