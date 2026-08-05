"use client";

import { BinaryIcon,BracesIcon,BriefcaseIcon,CalculatorIcon,CalendarIcon,ClockIcon,Code2Icon,DicesIcon,FileTextIcon,FingerprintIcon,GlobeIcon,HashIcon,LinkIcon,ListChecksIcon,MailIcon,PaletteIcon,PenLineIcon,PresentationIcon,SearchIcon,ShieldCheckIcon,TableIcon,WrenchIcon } from "lucide-react";
import { type ComponentType,type SVGProps } from "react";

import { Badge } from "@/components/ui/badge";
import { type BuiltInToolSummary,type ToolRiskLevel } from "@/modules/tool/builtin-tools-catalog";

export type BuiltInToolPolicy = BuiltInToolSummary & {
  enabled: boolean;
  requireApproval: boolean;
  configured: boolean;
};

export const CATEGORY_ORDER = ["Think", "Time", "Web", "Create", "Work", "Data", "Code", "Write", "Design"] as const;

type ToolCategory = (typeof CATEGORY_ORDER)[number];
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

function GithubMarkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.5l-.01-1.74c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.86.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.31.1-2.72 0 0 .85-.28 2.75 1.05A9.36 9.36 0 0 1 12 6.95c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.46.1 2.72.64.72 1.03 1.64 1.03 2.76 0 3.95-2.34 4.81-4.57 5.07.36.32.68.95.68 1.92l-.01 2.85c0 .28.18.61.69.5A10.19 10.19 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export const TOOL_ICONS: Record<string, IconComponent> = {
  calculator: CalculatorIcon,
  current_time: ClockIcon,
  http_fetch: GlobeIcon,
  web_search: SearchIcon,
  render_html_artifact: Code2Icon,
  run_code_sandbox: BracesIcon,
  code_workspace_create_project: Code2Icon,
  code_workspace_list_files: Code2Icon,
  code_workspace_read_file: Code2Icon,
  code_workspace_write_file: Code2Icon,
  code_workspace_replace_text: Code2Icon,
  code_workspace_delete_file: Code2Icon,
  github_get_publish_status: GithubMarkIcon,
  github_publish_code_workspace: GithubMarkIcon,
  create_slide_deck: PresentationIcon,
  create_business_document: FileTextIcon,
  create_spreadsheet: TableIcon,
  create_meeting_brief: CalendarIcon,
  create_action_plan: ListChecksIcon,
  create_decision_matrix: TableIcon,
  create_email_pack: MailIcon,
  create_project_status_report: ListChecksIcon,
  create_risk_register: ShieldCheckIcon,
  create_raci_matrix: TableIcon,
  create_customer_account_plan: BriefcaseIcon,
  create_competitive_battlecard: BriefcaseIcon,
  random_number: DicesIcon,
  uuid_generator: FingerprintIcon,
  date_math: CalendarIcon,
  json_tool: BracesIcon,
  text_stats: FileTextIcon,
  base64_tool: BinaryIcon,
  hash_text: HashIcon,
  unit_converter: CalculatorIcon,
  slugify_text: LinkIcon,
  color_converter: PaletteIcon,
  markdown_table: TableIcon,
};

export const CATEGORY_STYLES: Record<ToolCategory, { icon: IconComponent }> = {
  Think: { icon: WrenchIcon },
  Time: { icon: ClockIcon },
  Web: { icon: GlobeIcon },
  Create: { icon: Code2Icon },
  Work: { icon: BriefcaseIcon },
  Data: { icon: TableIcon },
  Code: { icon: BracesIcon },
  Write: { icon: PenLineIcon },
  Design: { icon: PaletteIcon },
};

const TOOL_CATEGORY_VALUES = new Set<string>(CATEGORY_ORDER);

export function isToolCategory(value: string): value is ToolCategory {
  const normalized = value.trim();
  return TOOL_CATEGORY_VALUES.has(normalized);
}

function riskBadgeVariant(riskLevel: ToolRiskLevel) {
  if (riskLevel === "high" || riskLevel === "critical") return "destructive";
  if (riskLevel === "medium") return "secondary";
  return "outline";
}

export function RiskBadge({ riskLevel, label }: { riskLevel: ToolRiskLevel; label: string }) {
  return (
    <Badge variant={riskBadgeVariant(riskLevel)} className="shrink-0 rounded-full px-2 text-[10px] font-medium">
      {label}
    </Badge>
  );
}
