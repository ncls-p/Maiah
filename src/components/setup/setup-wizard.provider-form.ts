import { DEFAULT_OPENAI_COMPATIBLE_API_ROUTE,type OpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";

import type { ProviderKind } from "./setup-wizard.button-type";

export type SetupProviderForm = {
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  openaiCompatibleApiRoute: OpenAICompatibleApiRoute;
};

export function createSetupProviderForm(name: string): SetupProviderForm {
  return {
    name,
    kind: "openai-compatible",
    baseUrl: "",
    apiKey: "",
    openaiCompatibleApiRoute: DEFAULT_OPENAI_COMPATIBLE_API_ROUTE,
  };
}
