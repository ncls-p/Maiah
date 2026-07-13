import { Audio } from "@remotion/media";
import {
	AbsoluteFill,
	interpolate,
	Sequence,
	staticFile,
	useCurrentFrame,
} from "remotion";

import { AmbientBackground } from "./components/VisualSystem";
import { SCENES, VIDEO_DURATION } from "./constants";
import { CapabilitiesScene } from "./scenes/CapabilitiesScene";
import { ChatScene } from "./scenes/ChatScene";
import { ClosingScene } from "./scenes/ClosingScene";
import { OpeningScene } from "./scenes/OpeningScene";
import { OrchestrationScene } from "./scenes/OrchestrationScene";
import { TrustScene } from "./scenes/TrustScene";
import { COLORS } from "./theme";

function FilmProgress() {
	const frame = useCurrentFrame();
	const width = interpolate(frame, [0, VIDEO_DURATION], [0, 100], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	return (
		<div
			aria-hidden="true"
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				zIndex: 50,
				height: 2,
				background: "rgba(104,216,231,0.07)",
			}}
		>
			<div
				style={{
					width: `${width}%`,
					height: "100%",
					background: COLORS.azure,
					boxShadow: "0 0 12px rgba(37,173,197,0.7)",
				}}
			/>
		</div>
	);
}

export function MaiahLaunchFilm() {
	return (
		<AbsoluteFill style={{ background: COLORS.ink }}>
			<Audio
				src={staticFile("remotion/maiah-score.wav")}
				volume={(frame) =>
					interpolate(
						frame,
						[0, 45, VIDEO_DURATION - 90, VIDEO_DURATION],
						[0, 0.72, 0.72, 0],
						{
							extrapolateLeft: "clamp",
							extrapolateRight: "clamp",
						},
					)
				}
			/>
			<AmbientBackground />

			<Sequence
				from={SCENES.opening.start}
				durationInFrames={SCENES.opening.duration}
				premountFor={30}
			>
				<OpeningScene duration={SCENES.opening.duration} />
			</Sequence>
			<Sequence
				from={SCENES.chat.start}
				durationInFrames={SCENES.chat.duration}
				premountFor={30}
			>
				<ChatScene duration={SCENES.chat.duration} />
			</Sequence>
			<Sequence
				from={SCENES.orchestration.start}
				durationInFrames={SCENES.orchestration.duration}
				premountFor={30}
			>
				<OrchestrationScene duration={SCENES.orchestration.duration} />
			</Sequence>
			<Sequence
				from={SCENES.capabilities.start}
				durationInFrames={SCENES.capabilities.duration}
				premountFor={30}
			>
				<CapabilitiesScene duration={SCENES.capabilities.duration} />
			</Sequence>
			<Sequence
				from={SCENES.trust.start}
				durationInFrames={SCENES.trust.duration}
				premountFor={30}
			>
				<TrustScene duration={SCENES.trust.duration} />
			</Sequence>
			<Sequence
				from={SCENES.closing.start}
				durationInFrames={SCENES.closing.duration}
				premountFor={30}
			>
				<ClosingScene duration={SCENES.closing.duration} />
			</Sequence>

			<FilmProgress />
		</AbsoluteFill>
	);
}
