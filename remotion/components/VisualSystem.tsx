import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";

import { COLORS, BODY_FONT, sceneOpacity } from "../theme";

export function SceneLayer({
	children,
	duration,
	fadeIn = true,
	fadeOut = true,
	light = false,
}: {
	children: ReactNode;
	duration: number;
	fadeIn?: boolean;
	fadeOut?: boolean;
	light?: boolean;
}) {
	const frame = useCurrentFrame();
	const opacity = sceneOpacity(frame, duration, {
		fadeIn,
		fadeOut,
		fadeFrames: 30,
	});
	const scale = interpolate(frame, [0, duration], [1.012, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	return (
		<AbsoluteFill
			style={{
				opacity,
				transform: `scale(${scale})`,
				transformOrigin: "center",
				color: light ? COLORS.ink : COLORS.white,
				fontFamily: BODY_FONT,
			}}
		>
			{children}
		</AbsoluteFill>
	);
}

export function AmbientBackground() {
	const frame = useCurrentFrame();
	const particles = Array.from({ length: 28 }, (_, index) => {
		const x = random(`particle-x-${index}`) * 100;
		const y = random(`particle-y-${index}`) * 100;
		const size = 1 + random(`particle-size-${index}`) * 2.5;
		const speed = 0.12 + random(`particle-speed-${index}`) * 0.35;
		const drift = Math.sin(frame * 0.015 * speed + index) * 12;
		const opacity =
			0.08 + (Math.sin(frame * 0.025 * speed + index * 0.72) + 1) * 0.08;
		return { x, y, size, drift, opacity };
	});

	return (
		<AbsoluteFill style={{ backgroundColor: COLORS.ink, overflow: "hidden" }}>
			<AbsoluteFill
				style={{
					background:
						"radial-gradient(circle at 76% 18%, rgba(37,173,197,0.17), transparent 32%), radial-gradient(circle at 12% 88%, rgba(217,181,109,0.10), transparent 30%), linear-gradient(135deg, #071216 0%, #091a20 54%, #071216 100%)",
				}}
			/>
			<AbsoluteFill
				style={{
					opacity: 0.28,
					transform: `translate(${Math.sin(frame / 110) * 18}px, ${Math.cos(frame / 130) * 12}px) scale(1.05)`,
					backgroundImage:
						"linear-gradient(rgba(104,216,231,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(104,216,231,0.055) 1px, transparent 1px)",
					backgroundSize: "80px 80px",
					maskImage:
						"radial-gradient(ellipse 76% 64% at 56% 45%, black 8%, transparent 78%)",
				}}
			/>
			{particles.map((particle, index) => (
				<div
					key={index}
					style={{
						position: "absolute",
						left: `${particle.x}%`,
						top: `${particle.y}%`,
						width: particle.size,
						height: particle.size,
						borderRadius: "50%",
						background: COLORS.azureBright,
						opacity: particle.opacity,
						transform: `translateY(${particle.drift}px)`,
						boxShadow: `0 0 ${particle.size * 5}px rgba(104,216,231,0.45)`,
					}}
				/>
			))}
			<AbsoluteFill
				style={{
					boxShadow: "inset 0 0 220px rgba(0,0,0,0.58)",
					pointerEvents: "none",
				}}
			/>
			<svg
				aria-hidden="true"
				width="100%"
				height="100%"
				style={{ position: "absolute", inset: 0, opacity: 0.055 }}
			>
				<filter id="film-grain">
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.8"
						numOctaves="3"
						seed="9"
					/>
					<feColorMatrix type="saturate" values="0" />
				</filter>
				<rect width="100%" height="100%" filter="url(#film-grain)" />
			</svg>
		</AbsoluteFill>
	);
}

export function SceneLabel({
	index,
	children,
	dark = false,
	style,
}: {
	index: string;
	children: ReactNode;
	dark?: boolean;
	style?: CSSProperties;
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 14,
				color: dark ? "rgba(7,18,22,0.56)" : COLORS.mist,
				fontSize: 16,
				fontWeight: 700,
				letterSpacing: "0.15em",
				textTransform: "uppercase",
				...style,
			}}
		>
			<span
				style={{
					display: "inline-grid",
					placeItems: "center",
					width: 34,
					height: 34,
					borderRadius: "50%",
					color: dark ? COLORS.ink : COLORS.azureBright,
					border: `1px solid ${dark ? "rgba(7,18,22,0.18)" : COLORS.lineStrong}`,
					fontSize: 12,
					fontVariantNumeric: "tabular-nums",
				}}
			>
				{index}
			</span>
			<span>{children}</span>
		</div>
	);
}

export function StatusPill({
	children,
	accent = COLORS.azure,
	light = false,
}: {
	children: ReactNode;
	accent?: string;
	light?: boolean;
}) {
	return (
		<div
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 10,
				padding: "10px 16px",
				borderRadius: 999,
				color: light ? COLORS.ink : COLORS.white,
				background: light ? "rgba(255,255,255,0.58)" : "rgba(8,25,31,0.68)",
				border: `1px solid ${light ? "rgba(7,18,22,0.12)" : COLORS.line}`,
				boxShadow: light
					? "0 12px 30px rgba(7,18,22,0.06)"
					: "0 12px 30px rgba(0,0,0,0.18)",
				fontSize: 15,
				fontWeight: 600,
				letterSpacing: "0.01em",
			}}
		>
			<span
				style={{
					width: 7,
					height: 7,
					borderRadius: "50%",
					background: accent,
					boxShadow: `0 0 12px ${accent}`,
				}}
			/>
			{children}
		</div>
	);
}

export function Hairline({
	width = 90,
	dark = false,
}: {
	width?: number;
	dark?: boolean;
}) {
	return (
		<div
			style={{
				width,
				height: 1,
				background: dark ? "rgba(7,18,22,0.18)" : COLORS.lineStrong,
			}}
		/>
	);
}
