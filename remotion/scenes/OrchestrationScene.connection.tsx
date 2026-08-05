import type { LucideIcon } from "lucide-react";
import {
CheckIcon
} from "lucide-react";
import { interpolate,useCurrentFrame } from "remotion";

import { COLORS,progress } from "../theme";

function quadraticPoint(
	amount: number,
	start: [number, number],
	control: [number, number],
	end: [number, number],
) {
	const inverse = 1 - amount;
	return {
		x:
			inverse ** 2 * start[0] +
			2 * inverse * amount * control[0] +
			amount ** 2 * end[0],
		y:
			inverse ** 2 * start[1] +
			2 * inverse * amount * control[1] +
			amount ** 2 * end[1],
	};
}

export function Connection({
	start,
	control,
	end,
	delay,
	color,
}: {
	start: [number, number];
	control: [number, number];
	end: [number, number];
	delay: number;
	color: string;
}) {
	const frame = useCurrentFrame();
	const draw = progress(frame, delay, 34);
	const travel = ((frame - delay - 20) % 75) / 75;
	const point = quadraticPoint(Math.max(0, travel), start, control, end);
	const pulseOpacity = interpolate(frame, [delay + 18, delay + 28], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const path = `M${start[0]} ${start[1]} Q${control[0]} ${control[1]} ${end[0]} ${end[1]}`;

	return (
		<g>
			<path
				d={path}
				pathLength="1"
				fill="none"
				stroke="rgba(120,188,199,0.12)"
				strokeWidth="10"
				strokeDasharray="1"
				strokeDashoffset={1 - draw}
			/>
			<path
				d={path}
				pathLength="1"
				fill="none"
				stroke={color}
				strokeOpacity="0.55"
				strokeWidth="1.5"
				strokeDasharray="1"
				strokeDashoffset={1 - draw}
			/>
			{travel >= 0 ? (
				<circle
					cx={point.x}
					cy={point.y}
					r="4.5"
					fill={color}
					opacity={pulseOpacity}
					style={{ filter: `drop-shadow(0 0 8px ${color})` }}
				/>
			) : null}
		</g>
	);
}

export function SpecialistNode({
	x,
	y,
	title,
	detail,
	icon: Icon,
	color,
	delay,
}: {
	x: number;
	y: number;
	title: string;
	detail: string;
	icon: LucideIcon;
	color: string;
	delay: number;
}) {
	const frame = useCurrentFrame();
	const value = progress(frame, delay, 26);
	const completed = progress(frame, delay + 56, 18);

	return (
		<div
			style={{
				position: "absolute",
				left: x - 112,
				top: y - 47,
				width: 224,
				height: 94,
				display: "flex",
				alignItems: "center",
				gap: 13,
				padding: "0 15px",
				borderRadius: 20,
				color: COLORS.white,
				background: "rgba(12,35,42,0.9)",
				border: `1px solid ${color}3e`,
				boxShadow: `0 24px 60px rgba(0,0,0,0.28), 0 0 38px ${color}0d`,
				opacity: value,
				transform: `scale(${0.75 + value * 0.25}) translateY(${(1 - value) * 20}px)`,
			}}
		>
			<div
				style={{
					display: "grid",
					placeItems: "center",
					width: 42,
					height: 42,
					flexShrink: 0,
					borderRadius: 13,
					color,
					background: `${color}12`,
					border: `1px solid ${color}32`,
				}}
			>
				<Icon size={19} strokeWidth={1.7} />
			</div>
			<div style={{ minWidth: 0, flex: 1 }}>
				<div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
				<div
					style={{
						marginTop: 4,
						overflow: "hidden",
						color: "#7e999f",
						fontSize: 10,
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{detail}
				</div>
			</div>
			<div
				style={{
					display: "grid",
					placeItems: "center",
					width: 23,
					height: 23,
					flexShrink: 0,
					borderRadius: "50%",
					color: completed > 0.5 ? COLORS.ink : color,
					background: completed > 0.5 ? COLORS.success : `${color}13`,
					border: `1px solid ${completed > 0.5 ? COLORS.success : `${color}35`}`,
				}}
			>
				{completed > 0.5 ? (
					<CheckIcon size={12} strokeWidth={2.5} />
				) : (
					<span
						style={{
							width: 5,
							height: 5,
							borderRadius: "50%",
							background: color,
							boxShadow: `0 0 9px ${color}`,
						}}
					/>
				)}
			</div>
		</div>
	);
}
