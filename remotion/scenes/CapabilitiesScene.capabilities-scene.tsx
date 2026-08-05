import {
DatabaseZapIcon
} from "lucide-react";
import { interpolate,useCurrentFrame } from "remotion";

import {
Hairline,
SceneLabel,
SceneLayer,
StatusPill,
} from "../components/VisualSystem";
import { COLORS,DISPLAY_FONT,rise } from "../theme";
import { capabilities } from "./CapabilitiesScene.capability";
import { CapabilityCard } from "./CapabilitiesScene.capability-card";


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
