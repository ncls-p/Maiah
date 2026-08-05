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

export type Capability = {
	title: string;
	description: string;
	icon: LucideIcon;
	accent: string;
	meta: string;
	visual: "knowledge" | "tools" | "sandbox" | "models" | "schedule" | "market";
};

export const capabilities: Capability[] = [
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

export type MiniVisualProps = {
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

export function KnowledgeVisual({ accent, pulse }: MiniVisualProps) {
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

export function ToolsVisual({ accent, pulse }: MiniVisualProps) {
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

export function SandboxVisual({ accent, pulse }: MiniVisualProps) {
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

export function ModelsVisual({ accent, pulse }: MiniVisualProps) {
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
