import { loadFont as loadInstrumentSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadManrope } from "@remotion/google-fonts/Manrope";
import { Easing, interpolate } from "remotion";
import type { CSSProperties } from "react";

const manrope = loadManrope("normal", {
	weights: ["400", "500", "600", "700", "800"],
	subsets: ["latin"],
});
const instrumentSerif = loadInstrumentSerif("normal", {
	weights: ["400"],
	subsets: ["latin"],
});
loadInstrumentSerif("italic", {
	weights: ["400"],
	subsets: ["latin"],
});

export const BODY_FONT = manrope.fontFamily;
export const DISPLAY_FONT = instrumentSerif.fontFamily;

export const COLORS = {
	ink: "#071216",
	inkSoft: "#0b1c22",
	panel: "#0f252c",
	panelRaised: "#15333b",
	azure: "#25adc5",
	azureBright: "#68d8e7",
	azureDark: "#137889",
	cloud: "#f2f1ec",
	white: "#fbfdfd",
	mist: "#a7bbc0",
	line: "rgba(150, 214, 225, 0.18)",
	lineStrong: "rgba(150, 214, 225, 0.34)",
	coral: "#ff846b",
	gold: "#d9b56d",
	success: "#7fd7af",
} as const;

const smoothEase = Easing.bezier(0.22, 1, 0.36, 1);

export function progress(frame: number, start: number, duration = 24): number {
	return interpolate(frame, [start, start + duration], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: smoothEase,
	});
}

export function fade(frame: number, start: number, duration = 18): number {
	return interpolate(frame, [start, start + duration], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
}

export function rise(
	frame: number,
	start: number,
	distance = 48,
	duration = 24,
): CSSProperties {
	const value = progress(frame, start, duration);
	return {
		opacity: value,
		transform: `translateY(${(1 - value) * distance}px)`,
		filter: `blur(${(1 - value) * 8}px)`,
	};
}

export function scaleIn(
	frame: number,
	start: number,
	from = 0.9,
	duration = 24,
): CSSProperties {
	const value = progress(frame, start, duration);
	return {
		opacity: value,
		transform: `scale(${from + (1 - from) * value})`,
		filter: `blur(${(1 - value) * 8}px)`,
	};
}

export function sceneOpacity(
	frame: number,
	duration: number,
	options: { fadeIn?: boolean; fadeOut?: boolean; fadeFrames?: number } = {},
): number {
	const { fadeIn = true, fadeOut = true, fadeFrames = 24 } = options;
	const entering = fadeIn
		? interpolate(frame, [0, fadeFrames], [0, 1], {
				extrapolateLeft: "clamp",
				extrapolateRight: "clamp",
			})
		: 1;
	const exiting = fadeOut
		? interpolate(frame, [duration - fadeFrames, duration], [1, 0], {
				extrapolateLeft: "clamp",
				extrapolateRight: "clamp",
			})
		: 1;
	return entering * exiting;
}
