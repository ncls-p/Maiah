"use client";

import { useState } from "react";
import { LockIcon, UnlockIcon, UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
	SettingsMetricRow,
	SettingsSection,
	SettingsStatusBadge,
} from "@/components/admin/settings-panel";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type RegistrationState = {
	registrationEnabled: boolean;
	userCount: number;
	canPublicSignUp: boolean;
};

export function RegistrationSettings({
	initialState,
}: {
	initialState: RegistrationState;
}) {
	const t = useTranslations("admin.settingsPage.registration");
	const [settings, setSettings] = useState(initialState);
	const [saving, setSaving] = useState(false);
	const isOpen = settings.registrationEnabled;

	async function updateRegistration(registrationEnabled: boolean) {
		setSaving(true);
		try {
			const res = await fetch("/api/admin/settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ registrationEnabled }),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.error || "Unable to update registration");
			}

			const nextSettings = (await res.json()) as RegistrationState;
			setSettings(nextSettings);
			toast.success(
				nextSettings.registrationEnabled ? t("opened") : t("closed"),
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Unable to update registration",
			);
		} finally {
			setSaving(false);
		}
	}

	return (
		<SettingsSection
			icon={UserPlusIcon}
			title={t("title")}
			description={t("description")}
			stagger="stagger-1"
			badge={
				<SettingsStatusBadge
					label={isOpen ? t("statusOpen") : t("statusClosed")}
					tone={isOpen ? "success" : "muted"}
				/>
			}
		>
			<div className="flex flex-col gap-4">
				<SettingsMetricRow
					label={t("accounts")}
					value={t("accountCount", { count: settings.userCount })}
					icon={UserPlusIcon}
				/>
				<p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
					{t("hint")}
				</p>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Button
						type="button"
						onClick={() => updateRegistration(false)}
						disabled={saving || !isOpen}
						variant={isOpen ? "default" : "outline"}
						className="sm:flex-1"
					>
						{saving ? (
							<Spinner data-icon="inline-start" />
						) : (
							<LockIcon data-icon="inline-start" aria-hidden="true" />
						)}
						{t("close")}
					</Button>
					<Button
						type="button"
						onClick={() => updateRegistration(true)}
						disabled={saving || isOpen}
						variant="outline"
						className="sm:flex-1"
					>
						{saving ? (
							<Spinner data-icon="inline-start" />
						) : (
							<UnlockIcon data-icon="inline-start" aria-hidden="true" />
						)}
						{t("open")}
					</Button>
				</div>
			</div>
		</SettingsSection>
	);
}
