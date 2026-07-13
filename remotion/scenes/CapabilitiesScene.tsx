import type { LucideIcon } from "lucide-react";
import {
	BlocksIcon,
	BookOpenIcon,
	BotIcon,
	BoxIcon,
	CalendarClockIcon,
	CheckIcon,
	Code2Icon,
	DatabaseZapIcon,
	PlugZapIcon,
	StoreIcon,
} from "lucide-react";
import { interpolate, useCurrentFrame } from "remotion";

import {
	Hairline,
	SceneLabel,
	SceneLayer,
	StatusPill,
} from "../components/VisualSystem";
import { COLORS, DISPLAY_FONT, progress, rise } from "../theme";

type Capability = {
	title: string;
	description: string;
	icon: LucideIcon;
	accent: string;
	meta: string;
	visual: "knowledge" | "tools" | "sandbox" | "models" | "schedule" | "market";
};

const capabilities: Capability[] = [
	{
		title: "Knowledge",
		description: "Ground every answer in your own documents.",
		icon: BookOpenIcon,
		accent: COLORS.azureBright,
		meta: "RAG · pgvector",
		visual: "knowledge",
	},
	{
		title: "Tools & MCP",
		description: "Connect systems without losing control.",
		icon: PlugZapIcon,
		accent: COLORS.coral,
		meta: "Native + custom",
		visual: "tools",
	},
	{
		title: "Code sandbox",
		description: "Run real work inside isolated environments.",
		icon: Code2Icon,
		accent: COLORS.gold,
		meta: "Python · Node",
		visual: "sandbox",
	},
	{
		title: "Any model",
		description: "Bring the providers your team already trusts.",
		icon: BotIcon,
		accent: COLORS.success,
		meta: "OpenAI-compatible",
		visual: "models",
	},
	{
		title: "Scheduled work",
		description: "Turn recurring missions into reliable routines.",
		icon: CalendarClockIcon,
		accent: COLORS.azureBright,
		meta: "Durable jobs",
		visual: "schedule",
	},
	{
		title: "Marketplace",
		description: "Share proven agents across the organization.",
		icon: StoreIcon,
		accent: COLORS.coral,
		meta: "Publish · reuse",
		visual: "market",
	},
];

type MiniVisualProps = {
	accent: string;
	frame: number;
	pulse: number;
};

function VisualLine({
	width,
	opacity = 0.14,
}: {
	width: string;
	opacity?: number;
}) {
	return (
		<div
			style={{
				width,
				height: 4,
				borderRadius: 9,
				background: `rgba(213,235,238,${opacity})`,
			}}
		/>
	);
}

function KnowledgeVisual({ accent, pulse }: MiniVisualProps) {
	return (
		<div
			style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 64 }}
		>
			{[46, 58, 40].map((height, index) => (
				<div
					key={height}
					style={{
						width: 44,
						height,
						padding: 7,
						borderRadius: "8px 8px 3px 3px",
						border: `1px solid ${accent}32`,
						background: `${accent}${index === 1 ? "17" : "0c"}`,
						transform: `translateY(${index === 1 ? -pulse * 4 : 0}px)`,
					}}
				>
					<VisualLine width="100%" opacity={0.22} />
					<div style={{ height: 5 }} />
					<VisualLine width="70%" opacity={0.12} />
				</div>
			))}
		</div>
	);
}

function ToolsVisual({ accent, pulse }: MiniVisualProps) {
	return (
		<div style={{ position: "relative", width: 150, height: 66 }}>
			<div
				style={{
					position: "absolute",
					left: 57,
					top: 17,
					display: "grid",
					placeItems: "center",
					width: 40,
					height: 40,
					borderRadius: 12,
					color: accent,
					background: `${accent}13`,
					border: `1px solid ${accent}35`,
				}}
			>
				<BlocksIcon size={17} />
			</div>
			{[
				[8, 8],
				[118, 3],
				[5, 46],
				[120, 48],
			].map(([left, top], index) => (
				<div
					key={`${left}-${top}`}
					style={{
						position: "absolute",
						left,
						top,
						width: 27,
						height: 27,
						borderRadius: 9,
						border: `1px solid ${accent}28`,
						background: `${accent}0b`,
						opacity: 0.5 + pulse * 0.5 * ((index % 2) + 0.5),
					}}
				/>
			))}
		</div>
	);
}

function SandboxVisual({ accent, pulse }: MiniVisualProps) {
	return (
		<div
			style={{
				width: 155,
				height: 70,
				padding: "10px 12px",
				borderRadius: 11,
				background: "rgba(3,12,15,0.72)",
				border: `1px solid ${accent}25`,
				fontFamily: "monospace",
				fontSize: 9,
				color: "#789198",
				lineHeight: 1.7,
			}}
		>
			<div>
				<span style={{ color: accent }}>$</span> run analysis.py
			</div>
			<div style={{ color: COLORS.success, opacity: pulse * 0.3 + 0.7 }}>
				✓ isolated · complete
			</div>
			<div>output/brief.md</div>
		</div>
	);
}

function ModelsVisual({ accent, pulse }: MiniVisualProps) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 8, height: 66 }}>
			{["O", "A", "G"].map((label, index) => (
				<div
					key={label}
					style={{
						display: "grid",
						placeItems: "center",
						width: index === 1 ? 52 : 42,
						height: index === 1 ? 52 : 42,
						borderRadius: "50%",
						color: index === 1 ? COLORS.ink : "#8fa8ae",
						background: index === 1 ? accent : `${accent}0c`,
						border: `1px solid ${accent}${index === 1 ? "ff" : "2d"}`,
						boxShadow:
							index === 1 ? `0 0 ${18 + pulse * 10}px ${accent}3d` : "none",
						fontSize: 12,
						fontWeight: 800,
					}}
				>
					{label}
				</div>
			))}
		</div>
	);
}

function ScheduleVisual({ accent, frame }: MiniVisualProps) {
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(5, 1fr)",
				gap: 7,
				width: 155,
				height: 66,
				alignItems: "center",
			}}
		>
			{[0, 1, 2, 3, 4].map((index) => {
				const active = index <= Math.floor((frame / 15) % 5);
				return (
					<div
						key={index}
						style={{
							display: "grid",
							placeItems: "center",
							height: 35 + (index % 2) * 12,
							borderRadius: 9,
							color: active ? COLORS.ink : accent,
							background: active ? accent : `${accent}0c`,
							border: `1px solid ${accent}32`,
						}}
					>
						{active ? (
							<CheckIcon size={12} strokeWidth={2.5} />
						) : (
							<span style={{ fontSize: 9 }}>0{index + 1}</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

function MarketVisual({ accent, pulse }: MiniVisualProps) {
	return (
		<div style={{ position: "relative", width: 160, height: 68 }}>
			{[0, 1, 2].map((index) => (
				<div
					key={index}
					style={{
						position: "absolute",
						left: index * 38,
						top: index === 1 ? 0 : 14,
						width: 76,
						height: 54,
						borderRadius: 12,
						color: accent,
						background: index === 1 ? `${accent}1b` : "rgba(7,18,22,0.82)",
						border: `1px solid ${accent}${index === 1 ? "42" : "22"}`,
						boxShadow: "0 12px 24px rgba(0,0,0,0.2)",
						transform: `translateY(${index === 1 ? -pulse * 3 : 0}px)`,
					}}
				>
					<BoxIcon size={15} style={{ margin: 10 }} />
				</div>
			))}
		</div>
	);
}

const MINI_VISUALS = {
	knowledge: KnowledgeVisual,
	tools: ToolsVisual,
	sandbox: SandboxVisual,
	models: ModelsVisual,
	schedule: ScheduleVisual,
	market: MarketVisual,
};

function MiniVisual({
	type,
	accent,
}: {
	type: Capability["visual"];
	accent: string;
}) {
	const frame = useCurrentFrame();
	const Visual = MINI_VISUALS[type];
	return (
		<Visual
			accent={accent}
			frame={frame}
			pulse={(Math.sin(frame / 8) + 1) / 2}
		/>
	);
}

function CapabilityCard({
	capability,
	index,
}: {
	capability: Capability;
	index: number;
}) {
	const frame = useCurrentFrame();
	const value = progress(frame, 35 + index * 8, 26);

	return (
		<div
			style={{
				position: "relative",
				minHeight: 270,
				overflow: "hidden",
				padding: 24,
				borderRadius: 23,
				background:
					"linear-gradient(145deg, rgba(18,45,53,0.94), rgba(10,29,35,0.92))",
				border: "1px solid rgba(145,213,224,0.14)",
				boxShadow: "0 26px 68px rgba(0,0,0,0.22)",
				opacity: value,
				transform: `translateY(${(1 - value) * 46}px) scale(${0.96 + value * 0.04})`,
			}}
		>
			<div
				aria-hidden="true"
				style={{
					position: "absolute",
					right: -50,
					top: -58,
					width: 170,
					height: 170,
					borderRadius: "50%",
					background: `radial-gradient(circle, ${capability.accent}19, transparent 68%)`,
				}}
			/>
			<div
				style={{
					display: "flex",
					alignItems: "flex-start",
					justifyContent: "space-between",
				}}
			>
				<div
					style={{
						display: "grid",
						placeItems: "center",
						width: 42,
						height: 42,
						borderRadius: 13,
						color: capability.accent,
						background: `${capability.accent}10`,
						border: `1px solid ${capability.accent}32`,
					}}
				>
					<capability.icon size={19} strokeWidth={1.7} />
				</div>
				<span
					style={{
						color: "#658087",
						fontSize: 9,
						fontWeight: 700,
						letterSpacing: "0.11em",
						textTransform: "uppercase",
					}}
				>
					{capability.meta}
				</span>
			</div>
			<div
				style={{
					marginTop: 17,
					color: COLORS.white,
					fontSize: 19,
					fontWeight: 700,
				}}
			>
				{capability.title}
			</div>
			<div
				style={{
					width: 250,
					marginTop: 7,
					color: "#829ca2",
					fontSize: 12,
					lineHeight: 1.5,
				}}
			>
				{capability.description}
			</div>
			<div style={{ position: "absolute", left: 24, bottom: 20 }}>
				<MiniVisual type={capability.visual} accent={capability.accent} />
			</div>
		</div>
	);
}

export function CapabilitiesScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame();
	const drift = interpolate(frame, [0, duration], [10, -10], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	return (
		<SceneLayer duration={duration}>
			<div
				style={{ position: "absolute", left: 92, top: 72, ...rise(frame, 4) }}
			>
				<SceneLabel index="03">A complete agent platform</SceneLabel>
			</div>

			<div style={{ position: "absolute", left: 98, top: 215, width: 490 }}>
				<div
					style={{
						...rise(frame, 12, 58, 28),
						color: COLORS.white,
						fontSize: 70,
						fontWeight: 750,
						lineHeight: 0.98,
						letterSpacing: "-0.06em",
					}}
				>
					Everything they need.
				</div>
				<div
					style={{
						...rise(frame, 23, 58, 28),
						marginTop: 10,
						color: COLORS.azureBright,
						fontFamily: DISPLAY_FONT,
						fontSize: 73,
						fontStyle: "italic",
						lineHeight: 0.96,
						letterSpacing: "-0.045em",
					}}
				>
					One coherent system.
				</div>
				<div style={{ ...rise(frame, 46, 26, 22), marginTop: 42 }}>
					<Hairline width={84} />
					<p
						style={{
							width: 430,
							margin: "22px 0 0",
							color: COLORS.mist,
							fontSize: 18,
							lineHeight: 1.58,
						}}
					>
						From retrieval to execution, Maiah keeps every capability close —
						without turning your stack into a maze.
					</p>
				</div>
				<div style={{ marginTop: 42, ...rise(frame, 95, 22, 20) }}>
					<StatusPill accent={COLORS.gold}>
						Built to grow with your team
					</StatusPill>
				</div>
			</div>

			<div
				style={{
					position: "absolute",
					left: 650,
					top: 172,
					width: 1135,
					display: "grid",
					gridTemplateColumns: "repeat(3, 1fr)",
					gap: 15,
					transform: `perspective(1800px) rotateY(-1.5deg) translateY(${drift}px)`,
					transformOrigin: "center right",
				}}
			>
				{capabilities.map((capability, index) => (
					<CapabilityCard
						key={capability.title}
						capability={capability}
						index={index}
					/>
				))}
			</div>

			<div
				aria-hidden="true"
				style={{
					position: "absolute",
					right: 74,
					bottom: 50,
					display: "flex",
					alignItems: "center",
					gap: 8,
					color: "#57737a",
					fontSize: 10,
					letterSpacing: "0.12em",
					textTransform: "uppercase",
					...rise(frame, 120, 18, 18),
				}}
			>
				<DatabaseZapIcon size={13} /> One workspace · one audit trail
			</div>
		</SceneLayer>
	);
}
