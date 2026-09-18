import { notFound } from "next/navigation";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { getSession } from "@/modules/auth/session";
import { getRegistrationSetting } from "@/modules/admin/use-cases";
import { getUsageImpactSetting } from "@/modules/provider/usage-impact-settings";
import { getDefaultRagConfig } from "@/modules/knowledge/rag-config";
import { RegistrationSettings } from "./registration-settings";
import { SystemHealthCard } from "./system-health-card";
import { UsageImpactSettings } from "./usage-impact-settings";
import { RagSettings } from "./rag-settings";
import { AssistantGovernanceSettings } from "./assistant-governance-settings";
import { ResourceDistributionPanel } from "@/components/iam/resource-distribution-panel";
import { UsageLimitsPanel } from "@/components/iam/usage-limits-panel";

export async function PlatformSettingsPage({ section }: { section: string }) {
  if (!(await isPlatformAdminSession(await getSession()))) notFound();
  switch (section) {
    case "registration":
      return (
        <RegistrationSettings initialState={await getRegistrationSetting()} />
      );
    case "health":
      return <SystemHealthCard />;
    case "impact":
      return (
        <UsageImpactSettings initialState={await getUsageImpactSetting()} />
      );
    case "rag":
      return <RagSettings initialState={await getDefaultRagConfig()} />;
    case "assistants":
      return <AssistantGovernanceSettings />;
    case "sharing":
      return <ResourceDistributionPanel />;
    case "limits":
      return <UsageLimitsPanel />;
    default:
      notFound();
  }
}
