import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, it } from "vitest";

import { db } from "@/server/infrastructure/db";
import {
  auditEvents,
  organizations,
  roleBindings,
  roles,
  users,
} from "@/server/infrastructure/db/schema";
import { runIamDatabaseScenario1 } from "./iam-use-cases-db.scenario-1";
import { runIamDatabaseScenario2 } from "./iam-use-cases-db.scenario-2";
import { runIamDatabaseScenario3 } from "./iam-use-cases-db.scenario-3";
import { runIamDatabaseScenario4 } from "./iam-use-cases-db.scenario-4";
import { runIamDatabaseScenario5 } from "./iam-use-cases-db.scenario-5";
import { runIamDatabaseScenario6 } from "./iam-use-cases-db.scenario-6";
import { runIamDatabaseScenario7 } from "./iam-use-cases-db.scenario-7";
import { runIamDatabaseScenario8 } from "./iam-use-cases-db.scenario-8";
import { runIamDatabaseScenario9 } from "./iam-use-cases-db.scenario-9";

const describeWithDatabase = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;

describeWithDatabase("hierarchical IAM use cases on PostgreSQL", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const outsiderId = randomUUID();
  const userIds = [ownerId, memberId, outsiderId];
  const organizationIds: string[] = [];

  const ownerEmail = `iam-owner-${suffix}@example.test`;
  const memberEmail = `iam-member-${suffix}@example.test`;
  const outsiderEmail = `iam-outsider-${suffix}@example.test`;

  let organizationId = "";
  let firstProjectId = "";
  let secondProjectId = "";
  let sharedAgentId = "";

  const context = {
    suffix,
    ownerId,
    memberId,
    outsiderId,
    userIds,
    organizationIds,
    ownerEmail,
    memberEmail,
    outsiderEmail,
    get organizationId() {
      return organizationId;
    },
    set organizationId(value: string) {
      organizationId = value;
    },
    get firstProjectId() {
      return firstProjectId;
    },
    set firstProjectId(value: string) {
      firstProjectId = value;
    },
    get secondProjectId() {
      return secondProjectId;
    },
    set secondProjectId(value: string) {
      secondProjectId = value;
    },
    get sharedAgentId() {
      return sharedAgentId;
    },
    set sharedAgentId(value: string) {
      sharedAgentId = value;
    },
  };

  beforeAll(async () => {
    await db.insert(users).values([
      {
        id: ownerId,
        name: "IAM Owner",
        email: ownerEmail,
        emailVerified: true,
      },
      {
        id: memberId,
        name: "IAM Member",
        email: memberEmail,
        emailVerified: true,
      },
      {
        id: outsiderId,
        name: "IAM Outsider",
        email: outsiderEmail,
        emailVerified: true,
      },
    ]);
  });

  afterAll(async () => {
    if (organizationIds.length > 0) {
      await db
        .delete(auditEvents)
        .where(inArray(auditEvents.organizationId, organizationIds));
    }
    await db
      .delete(roleBindings)
      .where(inArray(roleBindings.createdById, userIds));
    await db.delete(roles).where(inArray(roles.createdById, userIds));
    if (organizationIds.length > 0) {
      await db
        .delete(organizations)
        .where(inArray(organizations.id, organizationIds));
    }
    await db.delete(users).where(inArray(users.id, userIds));
  });

  it("manages an organization, projects, teams, scoped roles, and cleanup", async () => {
    await runIamDatabaseScenario1(context);
  }, 60_000);

  it("previews and atomically transfers a linked assistant bundle", async () => {
    await runIamDatabaseScenario2(context);
  }, 60_000);

  it("clones a complete project configuration without moving the source", async () => {
    await runIamDatabaseScenario3(context);
  }, 60_000);

  it("previews and atomically adds or moves members in bulk", async () => {
    await runIamDatabaseScenario4(context);
  }, 60_000);

  it("continues the latest assistant response in place in PostgreSQL", async () => {
    await runIamDatabaseScenario5(context);
  }, 60_000);

  it("clones and then moves a complete organization atomically", async () => {
    await runIamDatabaseScenario6(context);
  }, 60_000);

  it("renames and permanently deletes projects and organizations safely", async () => {
    await runIamDatabaseScenario7(context);
  }, 60_000);

  it("rejects privilege escalation and cross-organization identifiers", async () => {
    await runIamDatabaseScenario8(context);
  }, 60_000);

  it("shares assistants by team without granting edit permission", async () => {
    await runIamDatabaseScenario9(context);
  }, 60_000);
});
