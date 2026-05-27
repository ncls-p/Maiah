import { ShieldAlertIcon } from "lucide-react";

import { RegistrationSettings } from "@/components/admin/registration-settings";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	ensureBootstrapAdmin,
	getRegistrationSetting,
	isAdminRole,
} from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

export default async function SettingsPage() {
	const session = await getSession();
	const bootstrappedAdminId = await ensureBootstrapAdmin();
	const isAdmin =
		isAdminRole(session?.user.role) || bootstrappedAdminId === session?.user.id;

	if (!session || !isAdmin) {
		return (
			<div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-8">
				<Empty className="min-h-80 border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ShieldAlertIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>Admin access required</EmptyTitle>
						<EmptyDescription>
							Only admins can change account and registration settings.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	const registration = await getRegistrationSetting();

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col gap-2">
				<div className="section-kicker">Admin</div>
				<h1 className="text-2xl font-semibold sm:text-3xl">Settings</h1>
				<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
					Keep access intentional. Close public registration when users should
					be created by an admin.
				</p>
			</div>

			<RegistrationSettings initialState={registration} />
		</div>
	);
}
