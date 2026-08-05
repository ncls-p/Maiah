import { UserPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,DialogTrigger } from "@/components/ui/dialog";
import { Field,FieldGroup,FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";
import { fetchJson } from "@/lib/api-client";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { INITIAL_ACCOUNT_FORM } from "./access-console.resource-transfer-preview";
import { MutatingButton } from "./access-console.scope-path";
export function AccessPeopleTransferBranch2({ model }: { model: AccessConsoleViewModel }) {
  const { accountForm, accountMode, load, memberEmail, memberOpen, mutate, pendingAction, platformUsers, refreshPlatformAccounts, refreshWorkspaces, setAccountForm, setAccountMode, setMemberEmail, setMemberOpen, setPendingAction, t, workspaceId } = model;
  return (
    <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
          {t("addPerson")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addPersonTitle")}</DialogTitle>
          <DialogDescription>{t("addPersonDescription")}</DialogDescription>
        </DialogHeader>
        {platformUsers ? (
          <Tabs value={accountMode} onValueChange={(value) => setAccountMode(value as "existing" | "create")}>
            <TabsList className="w-full">
              <TabsTrigger value="existing">{t("existingAccount")}</TabsTrigger>
              <TabsTrigger value="create">{t("createAccount")}</TabsTrigger>
            </TabsList>
            <TabsContent value="existing">
              <form
                className="flex flex-col gap-5"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const saved = await mutate(
                    "addMember",
                    {
                      action: "addMember",
                      workspaceId,
                      email: memberEmail,
                    },
                    t("memberAdded"),
                    {
                      close: () => setMemberOpen(false),
                    },
                  );
                  if (saved) setMemberEmail("");
                }}
              >
                <Field>
                  <FieldLabel htmlFor="member-email">{t("email")}</FieldLabel>
                  <Input id="member-email" type="email" autoComplete="email" required value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} />
                </Field>
                <DialogFooter>
                  <MutatingButton pending={pendingAction === "addMember"}>{t("addToOrganization")}</MutatingButton>
                </DialogFooter>
              </form>
            </TabsContent>
            <TabsContent value="create">
              <form
                className="flex flex-col gap-5"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setPendingAction("createAccount");
                  try {
                    await fetchJson("/api/admin/users", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify(accountForm),
                    });
                    await fetchJson("/api/workspace/iam", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        action: "addMember",
                        workspaceId,
                        email: accountForm.email,
                      }),
                    });
                    await Promise.all([refreshPlatformAccounts(), load({ preserveData: true }), refreshWorkspaces()]);
                    setAccountForm(INITIAL_ACCOUNT_FORM);
                    setMemberOpen(false);
                    toast.success(t("accountAndMemberCreated"));
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : t("mutationError"));
                  } finally {
                    setPendingAction(null);
                  }
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="account-name">{t("name")}</FieldLabel>
                    <Input
                      id="account-name"
                      autoComplete="name"
                      required
                      value={accountForm.name}
                      onChange={(event) =>
                        setAccountForm({
                          ...accountForm,
                          name: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="account-email">{t("email")}</FieldLabel>
                    <Input
                      id="account-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={accountForm.email}
                      onChange={(event) =>
                        setAccountForm({
                          ...accountForm,
                          email: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="account-password">{t("temporaryPassword")}</FieldLabel>
                    <Input
                      id="account-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={accountForm.password}
                      onChange={(event) =>
                        setAccountForm({
                          ...accountForm,
                          password: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="account-role">{t("appRole")}</FieldLabel>
                    <Select
                      value={accountForm.role}
                      onValueChange={(value) =>
                        setAccountForm({
                          ...accountForm,
                          role: value as "user" | "admin",
                        })
                      }
                    >
                      <SelectTrigger id="account-role" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">{t("standardAccount")}</SelectItem>
                        <SelectItem value="admin">{t("appAdministrator")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
                <DialogFooter>
                  <MutatingButton pending={pendingAction === "createAccount"}>{t("createAndAdd")}</MutatingButton>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        ) : (
          <form
            className="flex flex-col gap-5"
            onSubmit={async (event) => {
              event.preventDefault();
              const saved = await mutate(
                "addMember",
                {
                  action: "addMember",
                  workspaceId,
                  email: memberEmail,
                },
                t("memberAdded"),
                { close: () => setMemberOpen(false) },
              );
              if (saved) setMemberEmail("");
            }}
          >
            <Field>
              <FieldLabel htmlFor="member-email">{t("email")}</FieldLabel>
              <Input id="member-email" type="email" autoComplete="email" required value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} />
            </Field>
            <DialogFooter>
              <MutatingButton pending={pendingAction === "addMember"}>{t("addToOrganization")}</MutatingButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
