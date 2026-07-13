import { ArrowUpRightIcon } from "lucide-react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";

import { SceneLayer } from "../components/VisualSystem";
import { COLORS, DISPLAY_FONT, progress, rise, scaleIn } from "../theme";

function ClosingRings() {
	const frame = useCurrentFrame();
	const value = progress(frame, 8, 44);
	const pulse = 1 + Math.sin(frame / 13) * 0.018;

	return (
		<div
			aria-hidden="true"
			style={{
				position: "absolute",
				left: "50%",
				top: "48%",
				width: 820,
				height: 820,
				borderRadius: "50%",
				opacity: value,
				transform: `translate(-50%, -50%) scale(${(0.82 + value * 0.18) * pulse})`,
				border: "1px solid rgba(104,216,231,0.11)",
				boxShadow:
					"0 0 0 80px rgba(37,173,197,0.025), 0 0 0 180px rgba(37,173,197,0.018), 0 0 190px rgba(37,173,197,0.11)",
			}}
		>
			<div
				style={{
					position: "absolute",
					inset: 78,
					borderRadius: "50%",
					border: "1px dashed rgba(104,216,231,0.12)",
					transform: `rotate(${frame * 0.12}deg)`,
				}}
			/>
			{[18, 142, 264].map((degrees, index) => {
				const angle =
					((degrees + frame * (index === 1 ? -0.08 : 0.06)) * Math.PI) / 180;
				const radius = 331;
				return (
					<span
						key={degrees}
						style={{
							position: "absolute",
							left: 410 + Math.cos(angle) * radius - 4,
							top: 410 + Math.sin(angle) * radius - 4,
							width: 8,
							height: 8,
							borderRadius: "50%",
							background: index === 1 ? COLORS.gold : COLORS.azureBright,
							boxShadow: `0 0 16px ${index === 1 ? COLORS.gold : COLORS.azureBright}`,
						}}
					/>
				);
			})}
		</div>
	);
}

export function ClosingScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame();
	const underline = progress(frame, 70, 32);
	const holdOpacity = interpolate(frame, [duration - 10, duration], [1, 0.92], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	return (
		<SceneLayer duration={duration} fadeOut={false}>
			<div
				style={{
					position: "absolute",
					inset: 0,
					background:
						"radial-gradient(circle at 50% 42%, rgba(37,173,197,0.13), transparent 42%), linear-gradient(135deg, #071216, #0a1d23 55%, #071216)",
					opacity: holdOpacity,
				}}
			/>
			<ClosingRings />

			<div
				style={{
					position: "absolute",
					left: 92,
					right: 92,
					top: 64,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					...rise(frame, 9, 20, 18),
				}}
			>
				<span
					style={{
						color: COLORS.mist,
						fontSize: 12,
						fontWeight: 700,
						letterSpacing: "0.18em",
						textTransform: "uppercase",
					}}
				>
					Deodis · Maiah
				</span>
				<span
					style={{
						color: COLORS.mist,
						fontSize: 12,
						fontWeight: 700,
						letterSpacing: "0.18em",
						textTransform: "uppercase",
					}}
				>
					Think · coordinate · deliver
				</span>
			</div>

			<div
				style={{
					position: "absolute",
					left: "50%",
					top: 142,
					width: 410,
					height: 153,
					transform: "translateX(-50%)",
					...scaleIn(frame, 21, 0.84, 28),
				}}
			>
				<Img
					src={staticFile("deodis-logo.png")}
					style={{ width: "100%", height: "100%", objectFit: "contain" }}
				/>
			</div>

			<div
				style={{
					position: "absolute",
					left: "50%",
					top: 385,
					width: 1120,
					transform: "translateX(-50%)",
					textAlign: "center",
				}}
			>
				<div
					style={{
						...rise(frame, 42, 48, 30),
						color: COLORS.white,
						fontSize: 102,
						fontWeight: 760,
						lineHeight: 0.96,
						letterSpacing: "-0.065em",
					}}
				>
					AI, made
				</div>
				<div
					style={{
						...rise(frame, 54, 48, 30),
						position: "relative",
						display: "inline-block",
						color: COLORS.azureBright,
						fontFamily: DISPLAY_FONT,
						fontSize: 112,
						fontStyle: "italic",
						lineHeight: 0.9,
						letterSpacing: "-0.04em",
					}}
				>
					operational.
					<span
						aria-hidden="true"
						style={{
							position: "absolute",
							left: "3%",
							right: `${97 - underline * 94}%`,
							bottom: -16,
							height: 2,
							borderRadius: 10,
							background:
								"linear-gradient(90deg, rgba(37,173,197,0), #68d8e7 18%, #68d8e7 82%, rgba(37,173,197,0))",
							boxShadow: "0 0 18px rgba(104,216,231,0.6)",
						}}
					/>
				</div>
			</div>

			<p
				style={{
					...rise(frame, 82, 28, 22),
					position: "absolute",
					left: "50%",
					top: 678,
					width: 700,
					margin: 0,
					transform: `translateX(-50%) translateY(${(1 - progress(frame, 82, 22)) * 28}px)`,
					color: COLORS.mist,
					textAlign: "center",
					fontSize: 19,
					lineHeight: 1.55,
					letterSpacing: "-0.01em",
				}}
			>
				Built with care by Deodis — for teams ready to turn AI into work that
				matters.
			</p>

			<div
				style={{
					...scaleIn(frame, 100, 0.92, 24),
					position: "absolute",
					left: "50%",
					bottom: 112,
					display: "flex",
					alignItems: "center",
					gap: 13,
					padding: "15px 19px 15px 22px",
					borderRadius: 999,
					color: COLORS.white,
					background: "rgba(15,37,44,0.82)",
					border: "1px solid rgba(104,216,231,0.22)",
					boxShadow: "0 22px 60px rgba(0,0,0,0.28)",
					fontSize: 15,
					fontWeight: 650,
					transform: `translateX(-50%) scale(${0.92 + progress(frame, 100, 24) * 0.08})`,
				}}
			>
				maiah.shiftify.eco
				<span
					style={{
						display: "grid",
						placeItems: "center",
						width: 29,
						height: 29,
						borderRadius: "50%",
						color: COLORS.ink,
						background: COLORS.azure,
					}}
				>
					<ArrowUpRightIcon size={15} strokeWidth={2.2} />
				</span>
			</div>
		</SceneLayer>
	);
}
