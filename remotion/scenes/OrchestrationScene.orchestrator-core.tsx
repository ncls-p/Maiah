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

export function OrchestratorCore() {
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
