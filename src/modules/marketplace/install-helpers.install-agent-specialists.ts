import {
  agentDelegationBindings,
  agents,
} from "@/server/infrastructure/db/schema";
import { eq } from "drizzle-orm";
import type { AgentMarketplaceManifest } from "./manifest-types";
import type { Tx } from "./install-helpers.tx";

export async function installAgentSpecialists(input: {
  tx: Tx;
  agentVersionId: string;
  specialists: NonNullable<AgentMarketplaceManifest["specialists"]>;
  install: (manifest: AgentMarketplaceManifest) => Promise<{ id: string }>;
}) {
  for (const specialist of input.specialists) {
    const childAgent = await input.install(specialist.manifest);
    const [child] = await input.tx
      .select({ activeVersionId: agents.activeVersionId })
      .from(agents)
      .where(eq(agents.id, childAgent.id))
      .limit(1);
    if (!child?.activeVersionId) {
      throw new Error("Installed specialist has no active version");
    }
    await input.tx.insert(agentDelegationBindings).values({
      agentVersionId: input.agentVersionId,
      childAgentId: childAgent.id,
      childAgentVersionId: child.activeVersionId,
      instructions: specialist.instructions?.trim() || null,
    });
  }
}
