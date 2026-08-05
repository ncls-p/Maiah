import {
BoxIcon,
CheckIcon
} from "lucide-react";
import { useCurrentFrame } from "remotion";

import { COLORS,progress } from "../theme";
import { Capability,KnowledgeVisual,MiniVisualProps,ModelsVisual,SandboxVisual,ToolsVisual } from "./CapabilitiesScene.capability";


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

export function CapabilityCard({
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
