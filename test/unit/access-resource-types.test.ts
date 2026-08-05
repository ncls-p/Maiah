import { describe,expect,it } from "vitest";

import { ACCESS_RESOURCE_DEFINITIONS,ACCESS_RESOURCE_TYPES,isAccessResourceType,resourceDefinition,ROLE_BINDING_RESOURCE_TYPES } from "@/server/domain/entities/access-resource";

describe("access resource registry", () => {
  it("covers every configurable project resource", () => {
    expect(ACCESS_RESOURCE_TYPES).toEqual(expect.arrayContaining(["agent", "provider", "model", "mcp_server", "tool_connector", "tool_connection", "custom_tool", "knowledge_base", "skill", "workflow", "scheduled_task", "conversation", "marketplace_item"]));
    expect(ROLE_BINDING_RESOURCE_TYPES).toEqual(["organization", "workspace", ...ACCESS_RESOURCE_TYPES]);
  });

  it("keeps one definition and at least one permission domain per type", () => {
    expect(ACCESS_RESOURCE_DEFINITIONS).toHaveLength(ACCESS_RESOURCE_TYPES.length);
    for (const type of ACCESS_RESOURCE_TYPES) {
      const definition = ACCESS_RESOURCE_DEFINITIONS.find((candidate) => candidate.type === type);
      expect(definition?.permissionDomains.length).toBeGreaterThan(0);
      expect(isAccessResourceType(type)).toBe(true);
    }
    expect(isAccessResourceType("workspace")).toBe(false);
    expect(isAccessResourceType("unknown")).toBe(false);
    expect(resourceDefinition("scheduled_task")?.permissionDomains).toEqual(expect.arrayContaining(["agents", "conversations"]));
  });
});
