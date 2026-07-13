import { interpolate, useCurrentFrame } from "remotion";

import { COLORS, DISPLAY_FONT, progress, rise } from "../theme";
import {
	Hairline,
	SceneLabel,
	SceneLayer,
	StatusPill,
} from "../components/VisualSystem";

function cubicPoint(
	amount: number,
	start: [number, number],
	controlA: [number, number],
	controlB: [number, number],
	end: [number, number],
) {
	const inverse = 1 - amount;
	return {
		x:
			inverse ** 3 * start[0] +
			3 * inverse ** 2 * amount * controlA[0] +
			3 * inverse * amount ** 2 * controlB[0] +
			amount ** 3 * end[0],
		y:
			inverse ** 3 * start[1] +
			3 * inverse ** 2 * amount * controlA[1] +
			3 * inverse * amount ** 2 * controlB[1] +
			amount ** 3 * end[1],
	};
}

function SignalLine() {
	const frame = useCurrentFrame();
	const draw = progress(frame, 6, 70);
	const pulseProgress = interpolate(frame, [42, 154], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const point = cubicPoint(
		pulseProgress,
		[-70, 846],
		[440, 850],
		[610, 690],
		[1020, 700],
	);

	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 1920 1080"
			style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
		>
			<defs>
				<linearGradient id="opening-signal" x1="0" x2="1">
					<stop offset="0" stopColor={COLORS.azure} stopOpacity="0" />
					<stop offset="0.3" stopColor={COLORS.azure} stopOpacity="0.8" />
					<stop
						offset="0.75"
						stopColor={COLORS.azureBright}
						stopOpacity="0.34"
					/>
					<stop offset="1" stopColor={COLORS.azureBright} stopOpacity="0" />
				</linearGradient>
				<filter id="opening-glow">
					<feGaussianBlur stdDeviation="8" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>
			<path
				d="M-70 846 C440 850 610 690 1020 700 S1510 890 2030 575"
				fill="none"
				stroke="rgba(37,173,197,0.13)"
				strokeWidth="30"
				filter="url(#opening-glow)"
				pathLength="1"
				strokeDasharray="1"
				strokeDashoffset={1 - draw}
			/>
			<path
				d="M-70 846 C440 850 610 690 1020 700 S1510 890 2030 575"
				fill="none"
				stroke="url(#opening-signal)"
				strokeWidth="2"
				pathLength="1"
				strokeDasharray="1"
				strokeDashoffset={1 - draw}
			/>
			<circle
				cx={point.x}
				cy={point.y}
				r="5"
				fill={COLORS.azureBright}
				opacity={progress(frame, 42, 12)}
				filter="url(#opening-glow)"
			/>
		</svg>
	);
}

function HeadlineLine({
	children,
	frame,
	start,
	accent = false,
}: {
	children: string;
	frame: number;
	start: number;
	accent?: boolean;
}) {
	return (
		<div
			style={{
				...rise(frame, start, 82, 30),
				fontFamily: accent ? DISPLAY_FONT : undefined,
				fontStyle: accent ? "italic" : undefined,
				color: accent ? COLORS.azureBright : COLORS.white,
				fontWeight: accent ? 400 : 700,
				letterSpacing: accent ? "-0.045em" : "-0.06em",
			}}
		>
			{children}
		</div>
	);
}

export function OpeningScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame();
	const ghostOpacity = interpolate(frame, [20, 80, 145], [0, 0.1, 0.03], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	return (
		<SceneLayer duration={duration} fadeIn={false}>
			<SignalLine />
			<div
				style={{
					position: "absolute",
					inset: "66px 86px auto 92px",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					...rise(frame, 4, 22, 20),
				}}
			>
				<SceneLabel index="00">Deodis presents</SceneLabel>
				<div
					style={{
						fontSize: 14,
						color: COLORS.mist,
						letterSpacing: "0.18em",
						textTransform: "uppercase",
					}}
				>
					Maiah · Product film
				</div>
			</div>

			<div
				aria-hidden="true"
				style={{
					position: "absolute",
					right: -54,
					top: 40,
					color: COLORS.white,
					opacity: ghostOpacity,
					fontSize: 420,
					lineHeight: 0.85,
					fontWeight: 800,
					letterSpacing: "-0.09em",
					transform: `translateX(${(1 - progress(frame, 18, 50)) * 110}px)`,
				}}
			>
				AI
			</div>

			<div
				style={{
					position: "absolute",
					left: 118,
					top: 224,
					width: 1120,
					fontSize: 116,
					lineHeight: 0.88,
				}}
			>
				<HeadlineLine frame={frame} start={20}>
					One place
				</HeadlineLine>
				<HeadlineLine frame={frame} start={29}>
					for your team to
				</HeadlineLine>
				<HeadlineLine frame={frame} start={40} accent>
					think with AI.
				</HeadlineLine>
			</div>

			<div
				style={{
					position: "absolute",
					left: 124,
					bottom: 110,
					display: "flex",
					alignItems: "center",
					gap: 24,
					...rise(frame, 86, 32, 24),
				}}
			>
				<Hairline width={112} />
				<div
					style={{
						width: 630,
						color: COLORS.mist,
						fontSize: 22,
						lineHeight: 1.55,
						letterSpacing: "-0.015em",
					}}
				>
					Build, coordinate, and govern AI agents — with your knowledge, your
					tools, and your people in control.
				</div>
			</div>

			<div
				style={{
					position: "absolute",
					right: 92,
					bottom: 100,
					...rise(frame, 104, 24, 22),
				}}
			>
				<StatusPill>Agents · Knowledge · Action</StatusPill>
			</div>
		</SceneLayer>
	);
}
