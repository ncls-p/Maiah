"use client";

import { useState } from "react";
import { LockIcon, UnlockIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
				nextSettings.registrationEnabled
					? "Registration is open"
					: "Registration is closed",
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
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex flex-col gap-1">
						<CardTitle>Registration</CardTitle>
						<CardDescription>
							Control whether people can create accounts without an admin.
						</CardDescription>
					</div>
					<Badge variant={isOpen ? "secondary" : "outline"}>
						{isOpen ? "Open" : "Closed"}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Alert>
					<AlertTitle>{settings.userCount} account(s)</AlertTitle>
					<AlertDescription>
						The first account can always be created and becomes admin. After
						that, this setting decides public sign-up access.
					</AlertDescription>
				</Alert>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Button
						type="button"
						onClick={() => updateRegistration(false)}
						disabled={saving || !isOpen}
						variant={isOpen ? "default" : "outline"}
					>
						{saving ? (
							<Spinner data-icon="inline-start" />
						) : (
							<LockIcon data-icon="inline-start" aria-hidden="true" />
						)}
						Close registration
					</Button>
					<Button
						type="button"
						onClick={() => updateRegistration(true)}
						disabled={saving || isOpen}
						variant="outline"
					>
						{saving ? (
							<Spinner data-icon="inline-start" />
						) : (
							<UnlockIcon data-icon="inline-start" aria-hidden="true" />
						)}
						Open registration
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
