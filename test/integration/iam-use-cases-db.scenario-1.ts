import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";
import {
  runIamDatabaseScenario1PartA,
  type IamScenario1State,
} from "./iam-use-cases-db.scenario-1.part-a";
import { runIamDatabaseScenario1PartB } from "./iam-use-cases-db.scenario-1.part-b";
import { runIamDatabaseScenario1PartC } from "./iam-use-cases-db.scenario-1.part-c";
import { runIamDatabaseScenario1PartD } from "./iam-use-cases-db.scenario-1.part-d";

export async function runIamDatabaseScenario1(
  context: IamDatabaseScenarioContext,
) {
  const state: IamScenario1State = {
    organizationId: context.organizationId,
    firstProjectId: context.firstProjectId,
    secondProjectId: context.secondProjectId,
    sharedAgentId: context.sharedAgentId,
    teamId: "",
    projectRoleId: "",
    resourceRoleId: "",
    privateAgentId: "",
    memberOwnedAgentId: "",
    providerId: "",
    modelId: "",
    modelRoleId: "",
  };
  await runIamDatabaseScenario1PartA(context, state);
  await runIamDatabaseScenario1PartB(context, state);
  await runIamDatabaseScenario1PartC(context, state);
  await runIamDatabaseScenario1PartD(context, state);
  Object.assign(context, {
    organizationId: state.organizationId,
    firstProjectId: state.firstProjectId,
    secondProjectId: state.secondProjectId,
    sharedAgentId: state.sharedAgentId,
  });
}
