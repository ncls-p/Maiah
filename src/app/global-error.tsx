"use client";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<html lang="en">
			<body>
				<main
					style={{
						alignItems: "center",
						background: "#0a0a0a",
						color: "#fafafa",
						display: "flex",
						fontFamily:
							"system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
						justifyContent: "center",
						minHeight: "100vh",
						padding: "1rem",
					}}
				>
					<section
						style={{
							border: "1px solid rgba(255,255,255,0.14)",
							borderRadius: "1rem",
							maxWidth: "32rem",
							padding: "1.5rem",
							textAlign: "center",
						}}
					>
						<p
							style={{
								fontSize: "0.75rem",
								letterSpacing: "0.16em",
								textTransform: "uppercase",
							}}
						>
							Unexpected error
						</p>
						<h1>Something went wrong</h1>
						<p style={{ color: "#a1a1aa" }}>
							Try again. If this keeps happening, share this error with your
							workspace administrator.
						</p>
						{error.digest ? (
							<p
								style={{
									color: "#a1a1aa",
									fontFamily: "monospace",
									fontSize: "0.75rem",
								}}
							>
								Digest: {error.digest}
							</p>
						) : null}
						<button
							type="button"
							onClick={reset}
							style={{
								background: "#fafafa",
								border: 0,
								borderRadius: "0.5rem",
								color: "#0a0a0a",
								cursor: "pointer",
								fontWeight: 600,
								marginTop: "1rem",
								padding: "0.625rem 1rem",
							}}
						>
							Try again
						</button>
					</section>
				</main>
			</body>
		</html>
	);
}
