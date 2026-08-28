import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";
import {
  runIamDatabaseScenario9PartA,
  type IamScenario9State,
} from "./iam-use-cases-db.scenario-9.part-a";
import { runIamDatabaseScenario9PartB } from "./iam-use-cases-db.scenario-9.part-b";
import { runIamDatabaseScenario9PartC } from "./iam-use-cases-db.scenario-9.part-c";

export async function runIamDatabaseScenario9(
  context: IamDatabaseScenarioContext,
) {
  const state: IamScenario9State = {
    teamId: "",
    agent: undefined as never,
    specialist: undefined as never,
    rootVersionId: "",
    specialistVersionId: "",
    knowledgeBaseId: "",
    chunkId: "",
  };
  await runIamDatabaseScenario9PartA(context, state);
  await runIamDatabaseScenario9PartB(context, state);
  await runIamDatabaseScenario9PartC(context, state);
}
