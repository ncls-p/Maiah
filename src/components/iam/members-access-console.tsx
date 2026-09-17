import {
  AccessConsole,
  type AccessConsoleSection,
} from "@/components/iam/access-console";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { listAdminUsers } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

export async function MembersAccessConsole({
  section,
}: {
  section: AccessConsoleSection;
}) {
  const session = await getSession();
  const isPlatformAdmin = await isPlatformAdminSession(session);
  const users = isPlatformAdmin ? await listAdminUsers() : [];

  return (
    <AccessConsole
      section={section}
      currentUserId={session?.user.id}
      platformUsers={
        isPlatformAdmin
          ? users.map((user) => ({
              ...user,
              createdAt: user.createdAt.toISOString(),
            }))
          : undefined
      }
    />
  );
}
