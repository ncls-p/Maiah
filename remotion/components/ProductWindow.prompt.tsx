import type { LucideIcon } from "lucide-react";
import {
CheckIcon,
SparklesIcon
} from "lucide-react";
import { interpolate,useCurrentFrame } from "remotion";

import { COLORS,progress } from "../theme";

export const PROMPT = "Prepare our launch brief and flag every operational risk.";

export function SidebarRow({
	icon: Icon,
	label,
	active = false,
}: {
	icon: LucideIcon;
	label: string;
	active?: boolean;
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 11,
				height: 42,
				padding: "0 12px",
				borderRadius: 11,
				color: active ? COLORS.white : "#8fa8ae",
				background: active ? "rgba(37,173,197,0.12)" : "transparent",
				fontSize: 13,
				fontWeight: active ? 600 : 500,
			}}
		>
			<Icon
				size={15}
				strokeWidth={1.8}
				color={active ? COLORS.azureBright : undefined}
			/>
			<span>{label}</span>
		</div>
	);
}

export function SpecialistRun({
	name,
	detail,
	icon: Icon,
	start,
	color,
}: {
	name: string;
	detail: string;
	icon: LucideIcon;
	start: number;
	color: string;
}) {
	const frame = useCurrentFrame();
	const entered = progress(frame, start, 22);
	const completed = progress(frame, start + 38, 18);
	const bar = interpolate(frame, [start + 6, start + 48], [0.12, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	return (
		<div
			style={{
				opacity: entered,
				transform: `translateX(${(1 - entered) * 28}px)`,
				display: "grid",
				gridTemplateColumns: "38px 1fr auto",
				alignItems: "center",
				gap: 12,
				padding: "12px 13px",
				borderRadius: 14,
				border: "1px solid rgba(142,196,205,0.14)",
				background: "rgba(15,37,44,0.74)",
			}}
		>
			<div
				style={{
					display: "grid",
					placeItems: "center",
					width: 38,
					height: 38,
					borderRadius: 11,
					color,
					background: `${color}16`,
					border: `1px solid ${color}36`,
				}}
			>
				<Icon size={17} strokeWidth={1.8} />
			</div>
			<div style={{ minWidth: 0 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						color: COLORS.white,
						fontSize: 13,
						fontWeight: 650,
					}}
				>
					{name}
					<span style={{ color: "#748f96", fontSize: 10, fontWeight: 500 }}>
						pinned · v3
					</span>
				</div>
				<div
					style={{
						marginTop: 4,
						color: "#8fa8ae",
						fontSize: 11,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					{detail}
				</div>
				<div
					style={{
						marginTop: 8,
						width: "100%",
						height: 2,
						overflow: "hidden",
						borderRadius: 10,
						background: "rgba(255,255,255,0.06)",
					}}
				>
					<div
						style={{
							width: `${bar * 100}%`,
							height: "100%",
							borderRadius: 10,
							background: color,
							boxShadow: `0 0 10px ${color}`,
						}}
					/>
				</div>
			</div>
			<div
				style={{
					display: "grid",
					placeItems: "center",
					width: 25,
					height: 25,
					borderRadius: "50%",
					color: completed > 0.5 ? COLORS.ink : color,
					background:
						completed > 0.5 ? COLORS.success : "rgba(255,255,255,0.04)",
					border: `1px solid ${completed > 0.5 ? COLORS.success : `${color}45`}`,
					transform: `scale(${0.82 + completed * 0.18})`,
				}}
			>
				{completed > 0.5 ? (
					<CheckIcon size={13} strokeWidth={2.4} />
				) : (
					<span
						style={{
							width: 5,
							height: 5,
							borderRadius: "50%",
							background: color,
							boxShadow: `0 0 10px ${color}`,
						}}
					/>
				)}
			</div>
		</div>
	);
}

export function ResponseCard() {
	const frame = useCurrentFrame();
	const value = progress(frame, 166, 24);
	const lineWidth = progress(frame, 180, 30);

	return (
		<div
			style={{
				opacity: value,
				transform: `translateY(${(1 - value) * 26}px)`,
				marginTop: 13,
				padding: "15px 17px",
				borderRadius: 16,
				background:
					"linear-gradient(135deg, rgba(37,173,197,0.11), rgba(15,37,44,0.72))",
				border: "1px solid rgba(104,216,231,0.2)",
				boxShadow: "0 18px 44px rgba(0,0,0,0.2)",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 12,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<div
						style={{
							display: "grid",
							placeItems: "center",
							width: 30,
							height: 30,
							borderRadius: 9,
							color: COLORS.azureBright,
							background: "rgba(37,173,197,0.12)",
						}}
					>
						<SparklesIcon size={15} />
					</div>
					<div>
						<div style={{ color: COLORS.white, fontSize: 13, fontWeight: 700 }}>
							Launch brief ready
						</div>
						<div style={{ color: "#7e999f", fontSize: 10, marginTop: 2 }}>
							3 specialists · 12 sources · 4.2k tokens
						</div>
					</div>
				</div>
				<div
					style={{
						padding: "5px 9px",
						borderRadius: 999,
						color: COLORS.success,
						background: "rgba(127,215,175,0.08)",
						fontSize: 9,
						fontWeight: 700,
						letterSpacing: "0.08em",
						textTransform: "uppercase",
					}}
				>
					Complete
				</div>
			</div>
			<div style={{ display: "grid", gap: 6, marginTop: 13 }}>
				{[0.93, 0.76, 0.58].map((width, index) => (
					<div
						key={width}
						style={{
							width: `${width * lineWidth * 100}%`,
							height: index === 0 ? 5 : 4,
							borderRadius: 10,
							background:
								index === 0
									? "rgba(213,235,238,0.5)"
									: "rgba(143,168,174,0.26)",
						}}
					/>
				))}
			</div>
		</div>
	);
}
