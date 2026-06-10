import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react";

import { WorkspacePage } from "@/components/workspace-page";
import { Button } from "@/components/ui/button";
import {
	ensureBootstrapAdmin,
	isAdminRole,
} from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

import { SettingsLocaleCard } from "./settings-locale";

export default async function SettingsPage() {
	const t = await getTranslations("settings");
	const tAdmin = await getTranslations("admin");
	const session = await getSession();
	const bootstrappedAdminId = await ensureBootstrapAdmin();
	const isAdmin =
		isAdminRole(session?.user.role) || bootstrappedAdminId === session?.user.id;

	return (
		<WorkspacePage
			title={t("title")}
			description={t("description")}
			width="default"
		>
			<div className="flex flex-col gap-6">
				<SettingsLocaleCard />

				{isAdmin ? (
					<section className="surface-panel animate-in-up stagger-2 overflow-hidden p-0">
						<div className="border-b border-border/60 bg-gradient-to-br from-primary/8 via-background to-chart-2/10 px-5 py-5 sm:px-6">
							<div className="flex items-center gap-2 text-primary">
								<ShieldCheckIcon className="size-4" aria-hidden="true" />
								<h2 className="text-sm font-semibold uppercase tracking-wider">
									{t("adminLinkTitle")}
								</h2>
							</div>
							<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
								{t("adminLinkDescription")}
							</p>
						</div>
						<div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
							<p className="text-sm text-muted-foreground">
								{tAdmin("platformSettingsDescription")}
							</p>
							<Button asChild variant="outline">
								<Link href="/admin/settings">
									{t("goToAdminSettings")}
									<ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
								</Link>
							</Button>
						</div>
					</section>
				) : null}
			</div>
		</WorkspacePage>
	);
}
