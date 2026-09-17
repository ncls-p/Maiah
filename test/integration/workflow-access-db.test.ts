import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSharingFixture } from "./resource-sharing-db.fixture";
import {
  createWorkflow,
  getWorkflowDetail,
  listWorkflows,
  updateWorkflow,
} from "@/modules/workflows/use-cases";
import { hasResourcePermissionForRequest } from "@/modules/auth/workspace-access";
import { replaceDirectResourceSharing } from "@/modules/iam/resource-direct-sharing";
import { addTeamMember, createTeam } from "@/modules/iam/use-cases";

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("workflow visibility and direct sharing", () => {
  let fixture: Awaited<ReturnType<typeof createSharingFixture>>;
  let workflowId: string;
  beforeAll(async () => {
    fixture = await createSharingFixture();
    workflowId = (
      await createWorkflow({
        workspaceId: fixture.workspaceId,
        userId: fixture.owner,
        name: "Access test",
      })
    ).id;
  }, 60_000);
  afterAll(async () => {
    await fixture?.cleanup();
  });
  const allowed = (
    userId: string,
    permission: string,
    workspaceId = fixture.workspaceId,
  ) =>
    hasResourcePermissionForRequest(
      userId,
      workspaceId,
      permission,
      "workflow",
      workflowId,
    );
  it("keeps a new workflow private even for a project editor", async () => {
    expect(await allowed(fixture.owner, "workflows.update")).toBe(true);
    expect(await allowed(fixture.member, "workflows.view")).toBe(false);
    expect(await allowed(fixture.member, "workflows.execute")).toBe(false);
    expect(await allowed(fixture.member, "workflows.update")).toBe(false);
    expect(await allowed(fixture.outsider, "workflows.view")).toBe(false);
  });
  it("grants only use permissions to a specific member and revokes them", async () => {
    const share = (userIds: string[]) =>
      replaceDirectResourceSharing({
        actorUserId: fixture.owner,
        workspaceId: fixture.workspaceId,
        resourceType: "workflow",
        resourceId: workflowId,
        userIds,
      });
    await share([fixture.member]);
    expect(await allowed(fixture.member, "workflows.view")).toBe(true);
    expect(await allowed(fixture.member, "workflows.execute")).toBe(true);
    expect(await allowed(fixture.member, "workflows.update")).toBe(false);
    await share([]);
    expect(await allowed(fixture.member, "workflows.view")).toBe(false);
  });
  it("persists team access and removes its grant when made private", async () => {
    const team = await createTeam({
      actorUserId: fixture.owner,
      workspaceId: fixture.workspaceId,
      name: "Workflow testers",
    });
    await addTeamMember({
      actorUserId: fixture.owner,
      workspaceId: fixture.workspaceId,
      teamId: team.id,
      userId: fixture.member,
    });
    const updated = await updateWorkflow({
      workflowId,
      workspaceId: fixture.workspaceId,
      userId: fixture.owner,
      access: { scope: "team", teamId: team.id },
    });
    expect(updated.access).toEqual({ scope: "team", teamId: team.id });
    expect(await allowed(fixture.member, "workflows.execute")).toBe(true);
    await updateWorkflow({
      workflowId,
      workspaceId: fixture.workspaceId,
      userId: fixture.owner,
      access: { scope: "private" },
    });
    expect(await allowed(fixture.member, "workflows.execute")).toBe(false);
  });
  it("shares with the project or organization without allowing another member to edit", async () => {
    await updateWorkflow({
      workflowId,
      workspaceId: fixture.workspaceId,
      userId: fixture.owner,
      access: { scope: "project" },
    });
    expect(await allowed(fixture.member, "workflows.execute")).toBe(true);
    expect(await allowed(fixture.member, "workflows.update")).toBe(false);
    expect(
      (await listWorkflows(fixture.destinationId)).some(
        (row) => row.id === workflowId,
      ),
    ).toBe(false);
    await updateWorkflow({
      workflowId,
      workspaceId: fixture.workspaceId,
      userId: fixture.owner,
      access: { scope: "organization" },
    });
    expect(
      (await getWorkflowDetail(workflowId, fixture.destinationId)).access.scope,
    ).toBe("organization");
    expect(
      (await listWorkflows(fixture.destinationId)).some(
        (row) => row.id === workflowId,
      ),
    ).toBe(true);
    expect(
      await allowed(fixture.member, "workflows.execute", fixture.destinationId),
    ).toBe(true);
    expect(
      await allowed(fixture.outsider, "workflows.view", fixture.destinationId),
    ).toBe(false);
    await updateWorkflow({
      workflowId,
      workspaceId: fixture.workspaceId,
      userId: fixture.owner,
      access: { scope: "private" },
    });
    expect(
      await allowed(fixture.member, "workflows.view", fixture.destinationId),
    ).toBe(false);
  });
});
