import { useCurrentFrame } from "remotion";

import { ProductWindow } from "../components/ProductWindow";
import {
	Hairline,
	SceneLabel,
	SceneLayer,
	StatusPill,
} from "../components/VisualSystem";
import { COLORS, DISPLAY_FONT, rise } from "../theme";

export function ChatScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame();

	return (
		<SceneLayer duration={duration}>
			<div
				style={{ position: "absolute", left: 92, top: 72, ...rise(frame, 7) }}
			>
				<SceneLabel index="01">One intelligent workspace</SceneLabel>
			</div>

			<div
				style={{
					position: "absolute",
					left: 96,
					top: 222,
					width: 400,
					zIndex: 2,
				}}
			>
				<div
					style={{
						...rise(frame, 18, 54, 28),
						color: COLORS.white,
						fontSize: 65,
						fontWeight: 750,
						lineHeight: 0.98,
						letterSpacing: "-0.055em",
					}}
				>
					From a question
				</div>
				<div
					style={{
						...rise(frame, 28, 54, 28),
						marginTop: 8,
						color: COLORS.azureBright,
						fontFamily: DISPLAY_FONT,
						fontSize: 67,
						fontStyle: "italic",
						lineHeight: 0.98,
						letterSpacing: "-0.04em",
					}}
				>
					to coordinated action.
				</div>
				<div style={{ ...rise(frame, 52, 28, 22), marginTop: 40 }}>
					<Hairline width={86} />
					<p
						style={{
							width: 338,
							margin: "24px 0 0",
							color: COLORS.mist,
							fontSize: 18,
							lineHeight: 1.55,
							letterSpacing: "-0.012em",
						}}
					>
						Chat naturally. Maiah plans the work, calls the right specialists,
						and brings one clear answer back.
					</p>
				</div>
			</div>

			<div
				style={{
					position: "absolute",
					left: 96,
					bottom: 105,
					display: "grid",
					gap: 12,
					...rise(frame, 112, 26, 22),
				}}
			>
				<StatusPill>Streaming responses</StatusPill>
				<StatusPill accent={COLORS.success}>Human approval built in</StatusPill>
			</div>

			<ProductWindow />
		</SceneLayer>
	);
}
