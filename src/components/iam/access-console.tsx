"use client";

import { useAccessConsoleController } from "./access-console.access-console";
import {
  AccessConsoleView,
  type AccessConsoleSection,
} from "./access-console.access-console.view";

export type { AccessConsoleSection };
export type { PlatformAccessUser } from "./access-console.access-member";

export function AccessConsole({
  section = "people",
  ...input
}: Parameters<typeof useAccessConsoleController>[0] & {
  section?: AccessConsoleSection;
}) {
  const model = useAccessConsoleController(input);
  if (!("kind" in model)) return model;
  return <AccessConsoleView model={model} section={section} />;
}
