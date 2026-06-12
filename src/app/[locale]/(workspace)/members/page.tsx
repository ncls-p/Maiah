import { ShieldAlertIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { RequireWorkspaceAccess } from "@/components/require-workspace-access";
import { WorkspacePage } from "@/components/workspace-page";
import { UserManagement } from "@/components/admin/user-management";
import { WorkspaceMemberManagement } from "@/components/workspace-member-management";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	ensureBootstrapAdmin,
	isAdminRole,
	listAdminUsers,
} from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

export default async function MembersPage() {
	const t = await getTranslations("admin");
	const session = await getSession();
	const bootstrappedAdminId = await ensureBootstrapAdmin();
	const isAdmin =
		isAdminRole(session?.user.role) || bootstrappedAdminId === session?.user.id;

	if (!session) {
		return (
			<WorkspacePage title={t("membersTitle")} width="default">
				<Empty className="min-h-80 border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ShieldAlertIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>{t("signInRequired")}</EmptyTitle>
						<EmptyDescription>
							{t("signInRequiredDescription")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</WorkspacePage>
		);
	}

	const users = isAdmin ? await listAdminUsers() : [];

	return (
		<RequireWorkspaceAccess required="canInviteMembers">
			<WorkspacePage
				title={t("membersTitle")}
				description={t("membersDescription")}
				width="wide"
			>
				<WorkspaceMemberManagement currentUserId={session.user.id} />

				{isAdmin ? (
					<section className="flex flex-col gap-6 border-t border-border/60 pt-8 animate-in-up stagger-4">
						<div className="flex flex-col gap-2">
							<h2 className="text-lg font-semibold tracking-tight">
								{t("platformAccounts")}
							</h2>
							<p className="max-w-2xl text-sm text-muted-foreground">
								{t("platformAccountsDescription")}
							</p>
						</div>
						<UserManagement
							initialUsers={JSON.parse(JSON.stringify(users))}
							currentUserId={session.user.id}
						/>
					</section>
				) : null}
			</WorkspacePage>
		</RequireWorkspaceAccess>
	);
}
