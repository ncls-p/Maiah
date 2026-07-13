import type { LucideIcon } from "lucide-react";
import {
	BracesIcon,
	ChartNoAxesCombinedIcon,
	CheckIcon,
	NetworkIcon,
	ScanSearchIcon,
	ShieldCheckIcon,
	UserRoundCheckIcon,
} from "lucide-react";
import { interpolate, useCurrentFrame } from "remotion";

import {
	Hairline,
	SceneLabel,
	SceneLayer,
	StatusPill,
} from "../components/VisualSystem";
import { COLORS, DISPLAY_FONT, progress, rise, scaleIn } from "../theme";

function quadraticPoint(
	amount: number,
	start: [number, number],
	control: [number, number],
	end: [number, number],
) {
	const inverse = 1 - amount;
	return {
		x:
			inverse ** 2 * start[0] +
			2 * inverse * amount * control[0] +
			amount ** 2 * end[0],
		y:
			inverse ** 2 * start[1] +
			2 * inverse * amount * control[1] +
			amount ** 2 * end[1],
	};
}

function Connection({
	start,
	control,
	end,
	delay,
	color,
}: {
	start: [number, number];
	control: [number, number];
	end: [number, number];
	delay: number;
	color: string;
}) {
	const frame = useCurrentFrame();
	const draw = progress(frame, delay, 34);
	const travel = ((frame - delay - 20) % 75) / 75;
	const point = quadraticPoint(Math.max(0, travel), start, control, end);
	const pulseOpacity = interpolate(frame, [delay + 18, delay + 28], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const path = `M${start[0]} ${start[1]} Q${control[0]} ${control[1]} ${end[0]} ${end[1]}`;

	return (
		<g>
			<path
				d={path}
				pathLength="1"
				fill="none"
				stroke="rgba(120,188,199,0.12)"
				strokeWidth="10"
				strokeDasharray="1"
				strokeDashoffset={1 - draw}
			/>
			<path
				d={path}
				pathLength="1"
				fill="none"
				stroke={color}
				strokeOpacity="0.55"
				strokeWidth="1.5"
				strokeDasharray="1"
				strokeDashoffset={1 - draw}
			/>
			{travel >= 0 ? (
				<circle
					cx={point.x}
					cy={point.y}
					r="4.5"
					fill={color}
					opacity={pulseOpacity}
					style={{ filter: `drop-shadow(0 0 8px ${color})` }}
				/>
			) : null}
		</g>
	);
}

function SpecialistNode({
	x,
	y,
	title,
	detail,
	icon: Icon,
	color,
	delay,
}: {
	x: number;
	y: number;
	title: string;
	detail: string;
	icon: LucideIcon;
	color: string;
	delay: number;
}) {
	const frame = useCurrentFrame();
	const value = progress(frame, delay, 26);
	const completed = progress(frame, delay + 56, 18);

	return (
		<div
			style={{
				position: "absolute",
				left: x - 112,
				top: y - 47,
				width: 224,
				height: 94,
				display: "flex",
				alignItems: "center",
				gap: 13,
				padding: "0 15px",
				borderRadius: 20,
				color: COLORS.white,
				background: "rgba(12,35,42,0.9)",
				border: `1px solid ${color}3e`,
				boxShadow: `0 24px 60px rgba(0,0,0,0.28), 0 0 38px ${color}0d`,
				opacity: value,
				transform: `scale(${0.75 + value * 0.25}) translateY(${(1 - value) * 20}px)`,
			}}
		>
			<div
				style={{
					display: "grid",
					placeItems: "center",
					width: 42,
					height: 42,
					flexShrink: 0,
					borderRadius: 13,
					color,
					background: `${color}12`,
					border: `1px solid ${color}32`,
				}}
			>
				<Icon size={19} strokeWidth={1.7} />
			</div>
			<div style={{ minWidth: 0, flex: 1 }}>
				<div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
				<div
					style={{
						marginTop: 4,
						overflow: "hidden",
						color: "#7e999f",
						fontSize: 10,
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{detail}
				</div>
			</div>
			<div
				style={{
					display: "grid",
					placeItems: "center",
					width: 23,
					height: 23,
					flexShrink: 0,
					borderRadius: "50%",
					color: completed > 0.5 ? COLORS.ink : color,
					background: completed > 0.5 ? COLORS.success : `${color}13`,
					border: `1px solid ${completed > 0.5 ? COLORS.success : `${color}35`}`,
				}}
			>
				{completed > 0.5 ? (
					<CheckIcon size={12} strokeWidth={2.5} />
				) : (
					<span
						style={{
							width: 5,
							height: 5,
							borderRadius: "50%",
							background: color,
							boxShadow: `0 0 9px ${color}`,
						}}
					/>
				)}
			</div>
		</div>
	);
}

function OrchestratorCore() {
	const frame = useCurrentFrame();
	const value = progress(frame, 35, 34);
	const rotation = frame * 0.2;
	const halo = 1 + Math.sin(frame / 11) * 0.035;

	return (
		<div
			style={{
				position: "absolute",
				left: 1240 - 106,
				top: 550 - 106,
				width: 212,
				height: 212,
				display: "grid",
				placeItems: "center",
				borderRadius: "50%",
				opacity: value,
				transform: `scale(${(0.6 + value * 0.4) * halo})`,
			}}
		>
			<div
				aria-hidden="true"
				style={{
					position: "absolute",
					inset: -31,
					borderRadius: "50%",
					border: "1px dashed rgba(104,216,231,0.24)",
					transform: `rotate(${rotation}deg)`,
				}}
			/>
			<div
				aria-hidden="true"
				style={{
					position: "absolute",
					inset: -14,
					borderRadius: "50%",
					border: "1px solid rgba(37,173,197,0.28)",
					boxShadow:
						"0 0 80px rgba(37,173,197,0.13), inset 0 0 40px rgba(37,173,197,0.07)",
				}}
			/>
			<div
				style={{
					position: "absolute",
					inset: 0,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					borderRadius: "50%",
					background:
						"radial-gradient(circle at 35% 28%, rgba(104,216,231,0.23), rgba(15,45,54,0.96) 45%, rgba(8,25,31,0.98))",
					border: "1px solid rgba(104,216,231,0.42)",
					boxShadow: "0 30px 90px rgba(0,0,0,0.38)",
				}}
			>
				<NetworkIcon size={30} color={COLORS.azureBright} strokeWidth={1.5} />
				<div
					style={{
						marginTop: 13,
						color: COLORS.white,
						fontSize: 15,
						fontWeight: 800,
						letterSpacing: "0.1em",
					}}
				>
					ATLAS
				</div>
				<div
					style={{
						marginTop: 5,
						color: "#779198",
						fontSize: 9,
						fontWeight: 650,
						letterSpacing: "0.12em",
						textTransform: "uppercase",
					}}
				>
					orchestrator
				</div>
			</div>
		</div>
	);
}

export function OrchestrationScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame();

	return (
		<SceneLayer duration={duration}>
			<div
				style={{ position: "absolute", left: 92, top: 72, ...rise(frame, 5) }}
			>
				<SceneLabel index="02">Purpose-built orchestration</SceneLabel>
			</div>

			<div
				style={{
					position: "absolute",
					left: 100,
					top: 236,
					width: 550,
					zIndex: 2,
				}}
			>
				<div
					style={{
						...rise(frame, 14, 62, 28),
						color: COLORS.white,
						fontSize: 74,
						fontWeight: 750,
						lineHeight: 0.96,
						letterSpacing: "-0.06em",
					}}
				>
					Not one agent.
				</div>
				<div
					style={{
						...rise(frame, 24, 62, 28),
						marginTop: 9,
						color: COLORS.azureBright,
						fontFamily: DISPLAY_FONT,
						fontSize: 78,
						fontStyle: "italic",
						lineHeight: 0.96,
						letterSpacing: "-0.045em",
					}}
				>
					A team of specialists.
				</div>
				<div style={{ ...rise(frame, 46, 30, 22), marginTop: 42 }}>
					<Hairline width={84} />
					<p
						style={{
							width: 455,
							margin: "22px 0 0",
							color: COLORS.mist,
							fontSize: 18,
							lineHeight: 1.58,
						}}
					>
						Every mission is version-pinned, permission-checked, and bounded by
						explicit budgets for depth, time, steps, and tokens.
					</p>
				</div>
			</div>

			<svg
				aria-hidden="true"
				viewBox="0 0 1920 1080"
				style={{
					position: "absolute",
					inset: 0,
					width: "100%",
					height: "100%",
				}}
			>
				<Connection
					start={[1184, 498]}
					control={[1080, 390]}
					end={[944, 305]}
					delay={48}
					color={COLORS.azureBright}
				/>
				<Connection
					start={[1295, 498]}
					control={[1425, 380]}
					end={[1560, 305]}
					delay={58}
					color={COLORS.coral}
				/>
				<Connection
					start={[1185, 605]}
					control={[1060, 705]}
					end={[950, 790]}
					delay={68}
					color={COLORS.gold}
				/>
				<Connection
					start={[1294, 605]}
					control={[1430, 705]}
					end={[1570, 775]}
					delay={78}
					color={COLORS.success}
				/>
			</svg>

			<OrchestratorCore />
			<SpecialistNode
				x={944}
				y={305}
				title="Research"
				detail="Evidence + live web"
				icon={ScanSearchIcon}
				color={COLORS.azureBright}
				delay={54}
			/>
			<SpecialistNode
				x={1560}
				y={305}
				title="Risk"
				detail="Controls + compliance"
				icon={ShieldCheckIcon}
				color={COLORS.coral}
				delay={64}
			/>
			<SpecialistNode
				x={950}
				y={790}
				title="Code"
				detail="Sandboxed execution"
				icon={BracesIcon}
				color={COLORS.gold}
				delay={74}
			/>
			<SpecialistNode
				x={1570}
				y={775}
				title="Operations"
				detail="Plans + follow-through"
				icon={ChartNoAxesCombinedIcon}
				color={COLORS.success}
				delay={84}
			/>

			<div
				style={{
					position: "absolute",
					left: 112,
					bottom: 96,
					display: "flex",
					alignItems: "center",
					gap: 11,
					...scaleIn(frame, 102, 0.94, 24),
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 11,
						padding: "13px 17px",
						borderRadius: 15,
						color: COLORS.white,
						background: "rgba(255,132,107,0.08)",
						border: "1px solid rgba(255,132,107,0.24)",
						boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
						fontSize: 13,
						fontWeight: 650,
					}}
				>
					<UserRoundCheckIcon size={17} color={COLORS.coral} />
					Human approval before sensitive actions
				</div>
			</div>

			<div
				style={{
					position: "absolute",
					right: 100,
					bottom: 80,
					display: "flex",
					gap: 10,
					...rise(frame, 120, 22, 22),
				}}
			>
				<StatusPill>Bounded</StatusPill>
				<StatusPill accent={COLORS.gold}>Observable</StatusPill>
				<StatusPill accent={COLORS.coral}>Cancellable</StatusPill>
			</div>
		</SceneLayer>
	);
}
