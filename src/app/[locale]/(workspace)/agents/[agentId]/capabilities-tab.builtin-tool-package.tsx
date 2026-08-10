"use client";

import {
  BracesIcon,
  BriefcaseIcon,
  ClockIcon,
  FileTextIcon,
  GlobeIcon,
  PaletteIcon,
  ShieldCheckIcon,
  WrenchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { ListRow } from "@/components/list-row";
import { Switch } from "@/components/ui/switch";

import type { BuiltinTool } from "./types";

type IconComponent = typeof WrenchIcon;

type BuiltinToolPackageDefinition = {
  id: string;
  icon: IconComponent;
  toolNames: string[];
};

export type BuiltinToolPackage = BuiltinToolPackageDefinition & {
  tools: BuiltinTool[];
};

const BUILTIN_TOOL_PACKAGES: BuiltinToolPackageDefinition[] = [
  {
    id: "essentials",
    icon: ClockIcon,
    toolNames: [
      "calculator",
      "current_time",
      "random_number",
      "uuid_generator",
      "date_math",
    ],
  },
  {
    id: "research",
    icon: GlobeIcon,
    toolNames: ["web_search", "http_fetch"],
  },
  {
    id: "workspace",
    icon: BracesIcon,
    toolNames: [
      "run_code_sandbox",
      "code_workspace_create_project",
      "code_workspace_list_files",
      "code_workspace_read_file",
      "code_workspace_write_file",
      "code_workspace_replace_text",
      "code_workspace_delete_file",
      "github_get_publish_status",
      "github_publish_code_workspace",
    ],
  },
  {
    id: "business",
    icon: BriefcaseIcon,
    toolNames: [
      "create_business_document",
      "create_spreadsheet",
      "create_meeting_brief",
      "create_action_plan",
      "create_decision_matrix",
      "create_email_pack",
      "create_project_status_report",
      "create_risk_register",
      "create_raci_matrix",
      "create_customer_account_plan",
      "create_competitive_battlecard",
    ],
  },
  {
    id: "data",
    icon: FileTextIcon,
    toolNames: [
      "json_tool",
      "text_stats",
      "base64_tool",
      "hash_text",
      "unit_converter",
      "slugify_text",
      "markdown_table",
    ],
  },
  {
    id: "visuals",
    icon: PaletteIcon,
    toolNames: [
      "generate_image",
      "render_html_artifact",
      "create_slide_deck",
      "color_converter",
    ],
  },
];

export function buildBuiltinToolPackages(
  tools: BuiltinTool[],
): BuiltinToolPackage[] {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const assignedToolNames = new Set<string>();
  const packages = BUILTIN_TOOL_PACKAGES.map((toolPackage) => {
    const packageTools = toolPackage.toolNames.flatMap((toolName) => {
      const tool = toolsByName.get(toolName);
      if (!tool) return [];
      assignedToolNames.add(toolName);
      return [tool];
    });
    return { ...toolPackage, tools: packageTools };
  }).filter((toolPackage) => toolPackage.tools.length > 0);

  const unassignedTools = tools.filter(
    (tool) => !assignedToolNames.has(tool.name),
  );
  if (unassignedTools.length > 0) {
    packages.push({
      id: "other",
      icon: WrenchIcon,
      toolNames: unassignedTools.map((tool) => tool.name),
      tools: unassignedTools,
    });
  }

  return packages;
}

export function ToolRow({
  name,
  description,
  enabled,
  onEnabledChange,
  requireApproval,
  approvalDisabled,
  onApprovalChange,
  approvalLabel,
}: {
  name: string;
  description?: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  requireApproval?: boolean;
  approvalDisabled?: boolean;
  onApprovalChange?: (checked: boolean) => void;
  approvalLabel?: string;
}) {
  const t = useTranslations("agents.capabilities");
  return (
    <ListRow className="items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="font-medium">{name}</p>
        {description ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-4">
        {onApprovalChange !== undefined && (
          <label className="flex items-center gap-2 text-xs">
            <ShieldCheckIcon
              className="size-3 text-muted-foreground"
              aria-hidden="true"
            />
            {approvalLabel}
            <Switch
              aria-label={t("approvalFor", { name })}
              checked={requireApproval ?? false}
              disabled={approvalDisabled ?? false}
              onCheckedChange={onApprovalChange}
            />
          </label>
        )}
        <Switch
          aria-label={t("toggleTool", { name })}
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>
    </ListRow>
  );
}
