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
import { Connection, SpecialistNode } from "./OrchestrationScene.connection";
import { OrchestratorCore } from "./OrchestrationScene.orchestrator-core";


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
