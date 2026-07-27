import { getTranslations } from "next-intl/server";

import { UserManagement } from "@/components/admin/user-management";
import { AccessConsole } from "@/components/iam/access-console";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspacePage } from "@/components/workspace-page";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { listAdminUsers } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

export default async function MembersPage() {
  const t = await getTranslations("access");
  const session = await getSession();
  const isPlatformAdmin = await isPlatformAdminSession(session);
  const users = isPlatformAdmin ? await listAdminUsers() : [];

  return (
    <WorkspacePage
      title={t("title")}
      description={t("description")}
      width="wide"
    >
      {isPlatformAdmin && session ? (
        <Tabs defaultValue="organization">
          <TabsList>
            <TabsTrigger value="organization">
              {t("organizationAccess")}
            </TabsTrigger>
            <TabsTrigger value="platform">{t("platformAccounts")}</TabsTrigger>
          </TabsList>
          <TabsContent value="organization">
            <AccessConsole />
          </TabsContent>
          <TabsContent value="platform" className="flex flex-col gap-5">
            <div>
              <h2 className="font-heading text-lg font-semibold">
                {t("platformAccounts")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("platformAccountsDescription")}
              </p>
            </div>
            <UserManagement
              initialUsers={users.map((user) => ({
                ...user,
                createdAt: user.createdAt.toISOString(),
              }))}
              currentUserId={session.user.id}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <AccessConsole />
      )}
    </WorkspacePage>
  );
}
