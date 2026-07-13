import type { LucideIcon } from "lucide-react";
import {
	CheckIcon,
	ChevronDownIcon,
	FileTextIcon,
	FolderIcon,
	MessageSquareIcon,
	MoreHorizontalIcon,
	NetworkIcon,
	PaperclipIcon,
	PlusIcon,
	SearchIcon,
	SendIcon,
	ShieldCheckIcon,
	SparklesIcon,
} from "lucide-react";
import { interpolate, useCurrentFrame } from "remotion";

import { COLORS, BODY_FONT, fade, progress, rise, scaleIn } from "../theme";

const PROMPT = "Prepare our launch brief and flag every operational risk.";

function SidebarRow({
	icon: Icon,
	label,
	active = false,
}: {
	icon: LucideIcon;
	label: string;
	active?: boolean;
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 11,
				height: 42,
				padding: "0 12px",
				borderRadius: 11,
				color: active ? COLORS.white : "#8fa8ae",
				background: active ? "rgba(37,173,197,0.12)" : "transparent",
				fontSize: 13,
				fontWeight: active ? 600 : 500,
			}}
		>
			<Icon
				size={15}
				strokeWidth={1.8}
				color={active ? COLORS.azureBright : undefined}
			/>
			<span>{label}</span>
		</div>
	);
}

function SpecialistRun({
	name,
	detail,
	icon: Icon,
	start,
	color,
}: {
	name: string;
	detail: string;
	icon: LucideIcon;
	start: number;
	color: string;
}) {
	const frame = useCurrentFrame();
	const entered = progress(frame, start, 22);
	const completed = progress(frame, start + 38, 18);
	const bar = interpolate(frame, [start + 6, start + 48], [0.12, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	return (
		<div
			style={{
				opacity: entered,
				transform: `translateX(${(1 - entered) * 28}px)`,
				display: "grid",
				gridTemplateColumns: "38px 1fr auto",
				alignItems: "center",
				gap: 12,
				padding: "12px 13px",
				borderRadius: 14,
				border: "1px solid rgba(142,196,205,0.14)",
				background: "rgba(15,37,44,0.74)",
			}}
		>
			<div
				style={{
					display: "grid",
					placeItems: "center",
					width: 38,
					height: 38,
					borderRadius: 11,
					color,
					background: `${color}16`,
					border: `1px solid ${color}36`,
				}}
			>
				<Icon size={17} strokeWidth={1.8} />
			</div>
			<div style={{ minWidth: 0 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						color: COLORS.white,
						fontSize: 13,
						fontWeight: 650,
					}}
				>
					{name}
					<span style={{ color: "#748f96", fontSize: 10, fontWeight: 500 }}>
						pinned · v3
					</span>
				</div>
				<div
					style={{
						marginTop: 4,
						color: "#8fa8ae",
						fontSize: 11,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					{detail}
				</div>
				<div
					style={{
						marginTop: 8,
						width: "100%",
						height: 2,
						overflow: "hidden",
						borderRadius: 10,
						background: "rgba(255,255,255,0.06)",
					}}
				>
					<div
						style={{
							width: `${bar * 100}%`,
							height: "100%",
							borderRadius: 10,
							background: color,
							boxShadow: `0 0 10px ${color}`,
						}}
					/>
				</div>
			</div>
			<div
				style={{
					display: "grid",
					placeItems: "center",
					width: 25,
					height: 25,
					borderRadius: "50%",
					color: completed > 0.5 ? COLORS.ink : color,
					background:
						completed > 0.5 ? COLORS.success : "rgba(255,255,255,0.04)",
					border: `1px solid ${completed > 0.5 ? COLORS.success : `${color}45`}`,
					transform: `scale(${0.82 + completed * 0.18})`,
				}}
			>
				{completed > 0.5 ? (
					<CheckIcon size={13} strokeWidth={2.4} />
				) : (
					<span
						style={{
							width: 5,
							height: 5,
							borderRadius: "50%",
							background: color,
							boxShadow: `0 0 10px ${color}`,
						}}
					/>
				)}
			</div>
		</div>
	);
}

function ResponseCard() {
	const frame = useCurrentFrame();
	const value = progress(frame, 166, 24);
	const lineWidth = progress(frame, 180, 30);

	return (
		<div
			style={{
				opacity: value,
				transform: `translateY(${(1 - value) * 26}px)`,
				marginTop: 13,
				padding: "15px 17px",
				borderRadius: 16,
				background:
					"linear-gradient(135deg, rgba(37,173,197,0.11), rgba(15,37,44,0.72))",
				border: "1px solid rgba(104,216,231,0.2)",
				boxShadow: "0 18px 44px rgba(0,0,0,0.2)",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 12,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<div
						style={{
							display: "grid",
							placeItems: "center",
							width: 30,
							height: 30,
							borderRadius: 9,
							color: COLORS.azureBright,
							background: "rgba(37,173,197,0.12)",
						}}
					>
						<SparklesIcon size={15} />
					</div>
					<div>
						<div style={{ color: COLORS.white, fontSize: 13, fontWeight: 700 }}>
							Launch brief ready
						</div>
						<div style={{ color: "#7e999f", fontSize: 10, marginTop: 2 }}>
							3 specialists · 12 sources · 4.2k tokens
						</div>
					</div>
				</div>
				<div
					style={{
						padding: "5px 9px",
						borderRadius: 999,
						color: COLORS.success,
						background: "rgba(127,215,175,0.08)",
						fontSize: 9,
						fontWeight: 700,
						letterSpacing: "0.08em",
						textTransform: "uppercase",
					}}
				>
					Complete
				</div>
			</div>
			<div style={{ display: "grid", gap: 6, marginTop: 13 }}>
				{[0.93, 0.76, 0.58].map((width, index) => (
					<div
						key={width}
						style={{
							width: `${width * lineWidth * 100}%`,
							height: index === 0 ? 5 : 4,
							borderRadius: 10,
							background:
								index === 0
									? "rgba(213,235,238,0.5)"
									: "rgba(143,168,174,0.26)",
						}}
					/>
				))}
			</div>
		</div>
	);
}

export function ProductWindow() {
	const frame = useCurrentFrame();
	const windowIn = progress(frame, 10, 32);
	const typedCharacters = Math.floor(
		interpolate(frame, [48, 94], [0, PROMPT.length], {
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
		}),
	);
	const prompt = PROMPT.slice(0, typedCharacters);
	const sent = frame >= 100;
	const thinkingOpacity =
		fade(frame, 102, 10) *
		interpolate(frame, [150, 164], [1, 0], {
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
		});

	return (
		<div
			style={{
				position: "absolute",
				left: 525,
				top: 128,
				width: 1310,
				height: 808,
				overflow: "hidden",
				borderRadius: 28,
				border: "1px solid rgba(145,213,224,0.2)",
				background: "rgba(8,25,31,0.94)",
				boxShadow:
					"0 70px 150px rgba(0,0,0,0.44), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 100px rgba(37,173,197,0.08)",
				opacity: windowIn,
				transform: `perspective(1800px) rotateY(${-2.5 + windowIn * 2.5}deg) translateY(${(1 - windowIn) * 64}px) scale(${0.965 + windowIn * 0.035})`,
				transformOrigin: "center right",
				fontFamily: BODY_FONT,
			}}
		>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "250px 1fr",
					height: "100%",
				}}
			>
				<aside
					style={{
						display: "flex",
						flexDirection: "column",
						padding: 18,
						background: "rgba(11,30,36,0.96)",
						borderRight: "1px solid rgba(145,213,224,0.1)",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							height: 38,
							marginBottom: 15,
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: 9 }}>
							<div
								style={{
									display: "grid",
									placeItems: "center",
									width: 28,
									height: 28,
									borderRadius: 9,
									color: COLORS.ink,
									background: COLORS.azure,
									fontSize: 12,
									fontWeight: 800,
								}}
							>
								A
							</div>
							<span
								style={{
									color: COLORS.white,
									fontSize: 14,
									fontWeight: 750,
									letterSpacing: "-0.03em",
								}}
							>
								Maiah
							</span>
						</div>
						<MoreHorizontalIcon size={16} color="#789198" />
					</div>
					<button
						type="button"
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
							height: 38,
							padding: 0,
							borderRadius: 11,
							border: "1px solid rgba(104,216,231,0.18)",
							color: COLORS.white,
							background: "rgba(37,173,197,0.1)",
							fontFamily: BODY_FONT,
							fontSize: 12,
							fontWeight: 650,
						}}
					>
						<PlusIcon size={14} /> New conversation
					</button>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							height: 36,
							marginTop: 13,
							padding: "0 11px",
							borderRadius: 10,
							color: "#718b91",
							background: "rgba(255,255,255,0.025)",
							fontSize: 11,
						}}
					>
						<SearchIcon size={13} /> Search conversations
					</div>
					<div
						style={{
							margin: "23px 11px 8px",
							color: "#5f7980",
							fontSize: 9,
							fontWeight: 700,
							letterSpacing: "0.15em",
							textTransform: "uppercase",
						}}
					>
						Workspace
					</div>
					<SidebarRow
						icon={MessageSquareIcon}
						label="Launch operations"
						active
					/>
					<SidebarRow icon={FolderIcon} label="Market intelligence" />
					<SidebarRow icon={FileTextIcon} label="Weekly brief" />
					<div style={{ flex: 1 }} />
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							paddingTop: 15,
							borderTop: "1px solid rgba(145,213,224,0.1)",
						}}
					>
						<div
							style={{
								display: "grid",
								placeItems: "center",
								width: 30,
								height: 30,
								borderRadius: "50%",
								color: COLORS.ink,
								background: COLORS.gold,
								fontSize: 10,
								fontWeight: 800,
							}}
						>
							ND
						</div>
						<div>
							<div
								style={{ color: COLORS.white, fontSize: 11, fontWeight: 650 }}
							>
								Nicolas
							</div>
							<div style={{ color: "#688188", fontSize: 9, marginTop: 2 }}>
								Deodis workspace
							</div>
						</div>
					</div>
				</aside>

				<main style={{ position: "relative", minWidth: 0 }}>
					<header
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							height: 64,
							padding: "0 24px",
							borderBottom: "1px solid rgba(145,213,224,0.1)",
							background: "rgba(7,18,22,0.54)",
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: 11 }}>
							<div
								style={{
									display: "grid",
									placeItems: "center",
									width: 34,
									height: 34,
									borderRadius: 11,
									color: COLORS.azureBright,
									background: "rgba(37,173,197,0.12)",
									border: "1px solid rgba(104,216,231,0.18)",
								}}
							>
								<NetworkIcon size={16} />
							</div>
							<div>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										color: COLORS.white,
										fontSize: 13,
										fontWeight: 700,
									}}
								>
									Atlas <ChevronDownIcon size={12} color="#789198" />
								</div>
								<div style={{ color: "#6f8990", fontSize: 9, marginTop: 2 }}>
									Orchestrator · ready
								</div>
							</div>
						</div>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 7,
								padding: "6px 10px",
								borderRadius: 999,
								color: COLORS.success,
								background: "rgba(127,215,175,0.07)",
								fontSize: 9,
								fontWeight: 700,
								letterSpacing: "0.06em",
								textTransform: "uppercase",
							}}
						>
							<ShieldCheckIcon size={12} /> Policy active
						</div>
					</header>

					<div
						style={{
							position: "absolute",
							inset: "64px 0 86px",
							display: "grid",
							gridTemplateColumns: "1fr 370px",
							gap: 20,
							padding: "26px 27px 20px",
						}}
					>
						<div>
							<div
								style={{
									...rise(frame, 44, 20, 18),
									marginLeft: "auto",
									width: 465,
									minHeight: 64,
									padding: "15px 17px",
									borderRadius: "17px 17px 5px 17px",
									color: COLORS.white,
									background: "rgba(37,173,197,0.13)",
									border: "1px solid rgba(104,216,231,0.18)",
									fontSize: 14,
									lineHeight: 1.5,
								}}
							>
								{prompt}
								{!sent ? (
									<span
										style={{
											display: "inline-block",
											width: 2,
											height: 17,
											marginLeft: 3,
											verticalAlign: -3,
											background: COLORS.azureBright,
											opacity: Math.floor(frame / 8) % 2 ? 0.25 : 1,
										}}
									/>
								) : null}
							</div>
							<div
								style={{
									...rise(frame, 104, 14, 14),
									display: "flex",
									alignItems: "center",
									gap: 9,
									marginTop: 22,
									color: "#8fa8ae",
									fontSize: 12,
									opacity: thinkingOpacity,
								}}
							>
								<div
									style={{
										display: "grid",
										placeItems: "center",
										width: 28,
										height: 28,
										borderRadius: 9,
										color: COLORS.azureBright,
										background: "rgba(37,173,197,0.1)",
									}}
								>
									<SparklesIcon size={13} />
								</div>
								Coordinating the right specialists
								<span style={{ letterSpacing: 3, color: COLORS.azureBright }}>
									···
								</span>
							</div>
							<div
								style={{
									...scaleIn(frame, 122, 0.97, 20),
									marginTop: 18,
									maxWidth: 530,
									padding: "14px 15px",
									borderRadius: 14,
									color: "#8fa8ae",
									background: "rgba(255,255,255,0.028)",
									border: "1px solid rgba(255,255,255,0.045)",
									fontSize: 11,
									lineHeight: 1.55,
								}}
							>
								<span style={{ color: COLORS.azureBright, fontWeight: 700 }}>
									Plan
								</span>{" "}
								· gather market evidence · audit launch dependencies · map
								mitigations and owners
							</div>
							<ResponseCard />
						</div>

						<div>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									marginBottom: 11,
									color: "#718b91",
									fontSize: 9,
									fontWeight: 700,
									letterSpacing: "0.13em",
									textTransform: "uppercase",
								}}
							>
								<span>Live delegation</span>
								<span>3 / 3</span>
							</div>
							<div style={{ display: "grid", gap: 9 }}>
								<SpecialistRun
									name="Research"
									detail="Market signals and cited evidence"
									icon={SearchIcon}
									start={108}
									color={COLORS.azureBright}
								/>
								<SpecialistRun
									name="Risk"
									detail="Operational dependencies and controls"
									icon={ShieldCheckIcon}
									start={123}
									color={COLORS.coral}
								/>
								<SpecialistRun
									name="Delivery"
									detail="Owners, milestones, and next actions"
									icon={NetworkIcon}
									start={138}
									color={COLORS.gold}
								/>
							</div>
						</div>
					</div>

					<div
						style={{
							position: "absolute",
							left: 25,
							right: 25,
							bottom: 20,
							display: "flex",
							alignItems: "center",
							gap: 10,
							height: 54,
							padding: "0 8px 0 15px",
							borderRadius: 16,
							color: "#6f8990",
							background: "rgba(15,37,44,0.82)",
							border: "1px solid rgba(145,213,224,0.13)",
							boxShadow: "0 12px 36px rgba(0,0,0,0.2)",
							fontSize: 12,
						}}
					>
						<PaperclipIcon size={15} />
						<span style={{ flex: 1 }}>Message Atlas…</span>
						<div
							style={{
								display: "grid",
								placeItems: "center",
								width: 38,
								height: 38,
								borderRadius: 11,
								color: COLORS.ink,
								background: COLORS.azure,
							}}
						>
							<SendIcon size={15} />
						</div>
					</div>
				</main>
			</div>
		</div>
	);
}
