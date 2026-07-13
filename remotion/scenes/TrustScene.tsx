import type { LucideIcon } from "lucide-react";
import {
	CheckIcon,
	FingerprintIcon,
	KeyRoundIcon,
	LockKeyholeIcon,
	ScrollTextIcon,
	ShieldCheckIcon,
	UsersRoundIcon,
} from "lucide-react";
import { interpolate, useCurrentFrame } from "remotion";

import { Hairline, SceneLabel, SceneLayer } from "../components/VisualSystem";
import { COLORS, DISPLAY_FONT, progress, rise } from "../theme";

const controls: Array<{
	title: string;
	detail: string;
	icon: LucideIcon;
	code: string;
}> = [
	{
		title: "Workspace isolation",
		detail: "Every team, role, and permission stays in its lane.",
		icon: UsersRoundIcon,
		code: "IAM",
	},
	{
		title: "Policy-gated tools",
		detail: "Sensitive actions wait for an explicit green light.",
		icon: ShieldCheckIcon,
		code: "OPA",
	},
	{
		title: "Encrypted secrets",
		detail: "Provider keys and payloads remain protected at rest.",
		icon: KeyRoundIcon,
		code: "AES–GCM",
	},
	{
		title: "Auditable by default",
		detail: "Runs, usage, approvals, and changes leave a clear trail.",
		icon: ScrollTextIcon,
		code: "TRACE",
	},
];

function ControlRow({
	title,
	detail,
	icon: Icon,
	code,
	index,
}: (typeof controls)[number] & { index: number }) {
	const frame = useCurrentFrame();
	const value = progress(frame, 28 + index * 11, 27);
	const complete = progress(frame, 78 + index * 7, 18);

	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "54px 1fr auto auto",
				alignItems: "center",
				gap: 16,
				minHeight: 104,
				padding: "0 20px",
				borderRadius: 22,
				color: COLORS.ink,
				background: "rgba(255,255,255,0.62)",
				border: "1px solid rgba(7,18,22,0.09)",
				boxShadow: "0 22px 56px rgba(7,18,22,0.07)",
				opacity: value,
				transform: `translateX(${(1 - value) * 70}px)`,
			}}
		>
			<div
				style={{
					display: "grid",
					placeItems: "center",
					width: 48,
					height: 48,
					borderRadius: 15,
					color: COLORS.azureDark,
					background: "rgba(37,173,197,0.11)",
					border: "1px solid rgba(19,120,137,0.15)",
				}}
			>
				<Icon size={21} strokeWidth={1.7} />
			</div>
			<div>
				<div
					style={{ fontSize: 17, fontWeight: 750, letterSpacing: "-0.025em" }}
				>
					{title}
				</div>
				<div
					style={{ marginTop: 5, color: "rgba(7,18,22,0.55)", fontSize: 12 }}
				>
					{detail}
				</div>
			</div>
			<div
				style={{
					padding: "7px 10px",
					borderRadius: 9,
					color: "rgba(7,18,22,0.54)",
					background: "rgba(7,18,22,0.045)",
					fontFamily: "monospace",
					fontSize: 9,
					fontWeight: 700,
					letterSpacing: "0.09em",
				}}
			>
				{code}
			</div>
			<div
				style={{
					display: "grid",
					placeItems: "center",
					width: 29,
					height: 29,
					borderRadius: "50%",
					color: complete > 0.5 ? COLORS.white : COLORS.azureDark,
					background:
						complete > 0.5 ? COLORS.azureDark : "rgba(37,173,197,0.08)",
					border: "1px solid rgba(19,120,137,0.2)",
					transform: `scale(${0.78 + complete * 0.22})`,
				}}
			>
				<CheckIcon size={14} strokeWidth={2.4} />
			</div>
		</div>
	);
}

export function TrustScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame();
	const orbX = interpolate(frame, [0, duration], [0, 36], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	return (
		<SceneLayer duration={duration} light>
			<div
				style={{
					position: "absolute",
					inset: 0,
					overflow: "hidden",
					background: COLORS.cloud,
				}}
			>
				<div
					aria-hidden="true"
					style={{
						position: "absolute",
						left: -260 + orbX,
						top: -360,
						width: 1050,
						height: 1050,
						borderRadius: "50%",
						background:
							"radial-gradient(circle, rgba(37,173,197,0.19), rgba(37,173,197,0.04) 42%, transparent 69%)",
					}}
				/>
				<div
					aria-hidden="true"
					style={{
						position: "absolute",
						inset: 0,
						opacity: 0.32,
						backgroundImage:
							"linear-gradient(rgba(7,18,22,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(7,18,22,0.045) 1px, transparent 1px)",
						backgroundSize: "80px 80px",
						maskImage:
							"radial-gradient(ellipse 74% 72% at 78% 48%, black 10%, transparent 78%)",
					}}
				/>
			</div>

			<div
				style={{ position: "absolute", left: 92, top: 72, ...rise(frame, 4) }}
			>
				<SceneLabel index="04" dark>
					Enterprise control, human clarity
				</SceneLabel>
			</div>

			<div style={{ position: "absolute", left: 105, top: 238, width: 620 }}>
				<div
					style={{
						...rise(frame, 12, 62, 28),
						color: COLORS.ink,
						fontSize: 82,
						fontWeight: 760,
						lineHeight: 0.96,
						letterSpacing: "-0.065em",
					}}
				>
					Built to be
				</div>
				<div
					style={{
						...rise(frame, 23, 62, 28),
						color: COLORS.azureDark,
						fontFamily: DISPLAY_FONT,
						fontSize: 92,
						fontStyle: "italic",
						lineHeight: 0.9,
						letterSpacing: "-0.04em",
					}}
				>
					trusted.
				</div>
				<div style={{ ...rise(frame, 45, 28, 22), marginTop: 48 }}>
					<Hairline width={92} dark />
					<p
						style={{
							width: 510,
							margin: "24px 0 0",
							color: "rgba(7,18,22,0.62)",
							fontSize: 20,
							lineHeight: 1.58,
							letterSpacing: "-0.015em",
						}}
					>
						Multi-tenant by design. Human control by default. Production-grade
						from the first workspace to the hundredth.
					</p>
				</div>
				<div
					style={{
						...rise(frame, 80, 24, 20),
						display: "inline-flex",
						alignItems: "center",
						gap: 12,
						marginTop: 48,
						padding: "13px 17px",
						borderRadius: 16,
						color: COLORS.ink,
						background: "rgba(255,255,255,0.62)",
						border: "1px solid rgba(7,18,22,0.09)",
						boxShadow: "0 18px 42px rgba(7,18,22,0.06)",
						fontSize: 13,
						fontWeight: 650,
					}}
				>
					<FingerprintIcon size={18} color={COLORS.azureDark} />
					Your data. Your rules. Your audit trail.
				</div>
			</div>

			<div
				style={{
					position: "absolute",
					right: 105,
					top: 202,
					width: 890,
					display: "grid",
					gap: 13,
				}}
			>
				{controls.map((control, index) => (
					<ControlRow key={control.title} {...control} index={index} />
				))}
			</div>

			<div
				aria-hidden="true"
				style={{
					position: "absolute",
					right: 64,
					bottom: 40,
					display: "flex",
					alignItems: "center",
					gap: 9,
					color: "rgba(7,18,22,0.36)",
					fontSize: 10,
					fontWeight: 700,
					letterSpacing: "0.14em",
					textTransform: "uppercase",
					...rise(frame, 104, 18, 18),
				}}
			>
				<LockKeyholeIcon size={13} /> Secure by architecture, not by accident
			</div>
		</SceneLayer>
	);
}
