import { ShieldAlertIcon } from "lucide-react";

import { UserManagement } from "@/components/admin/user-management";
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
	const session = await getSession();
	const bootstrappedAdminId = await ensureBootstrapAdmin();
	const isAdmin =
		isAdminRole(session?.user.role) || bootstrappedAdminId === session?.user.id;

	if (!session || !isAdmin) {
		return (
			<div className="mx-auto flex w-full max-w-4xl flex-col px-4 py-6 sm:px-6 sm:py-8">
				<Empty className="min-h-80 border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ShieldAlertIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>Admin access required</EmptyTitle>
						<EmptyDescription>
							Only admins can create users, promote admins, or suspend access.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	const users = await listAdminUsers();

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col gap-2">
				<div className="section-kicker">Team</div>
				<h1 className="text-2xl font-semibold sm:text-3xl">Accounts</h1>
				<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
					Manage who can sign in. Admin actions here take effect immediately.
				</p>
			</div>

			<UserManagement
				initialUsers={JSON.parse(JSON.stringify(users))}
				currentUserId={session.user.id}
			/>
		</div>
	);
}
