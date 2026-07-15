import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
	output: "standalone",
	serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
	allowedDevOrigins: ["192.168.1.152", "100.98.140.47"],
	experimental: {
		proxyClientMaxBodySize: "30mb",
		serverActions: {
			bodySizeLimit: "10mb",
		},
	},
};

export default withNextIntl(nextConfig);
