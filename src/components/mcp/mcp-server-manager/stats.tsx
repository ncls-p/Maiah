import { MetricCell } from "@/components/ui/metric-cell";
import { useTranslations } from "next-intl";

import type { McpServer, McpTool } from "./types";

export function SystemStrip({
  servers,
  toolsByServer,
}: {
  servers: McpServer[];
  toolsByServer: Record<string, McpTool[]>;
}) {
  const t = useTranslations("mcp.serverManager");
  const totalTools = Object.values(toolsByServer).reduce(
    (sum, t) => sum + t.length,
    0,
  );
  const enabledServers = servers.filter((s) => s.enabled).length;
  const enabledTools = Object.values(toolsByServer).reduce(
    (sum, t) => sum + t.filter((t) => t.enabled).length,
    0,
  );

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      <MetricCell label={t("metricServers")} value={servers.length} />
      <MetricCell label={t("metricTools")} value={totalTools} />
      <MetricCell
        label={t("metricEnabledServers")}
        value={enabledServers}
        accent
      />
      <MetricCell label={t("metricEnabledTools")} value={enabledTools} />
    </div>
  );
}
