CREATE TYPE "public"."organization_member_status" AS ENUM(
  'active',
  'suspended',
  'removed'
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" "organization_member_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(128) NOT NULL,
  "description" text,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_members"
  ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_members"
  ADD CONSTRAINT "organization_members_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "teams"
  ADD CONSTRAINT "teams_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "teams"
  ADD CONSTRAINT "teams_created_by_user_id_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_members"
  ADD CONSTRAINT "team_members_team_id_teams_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_members"
  ADD CONSTRAINT "team_members_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_org_user_unique"
  ON "organization_members" USING btree ("organization_id", "user_id");
--> statement-breakpoint
CREATE INDEX "organization_members_user_status_idx"
  ON "organization_members" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_slug_unique"
  ON "teams" USING btree ("organization_id", "slug");
--> statement-breakpoint
CREATE INDEX "teams_organization_idx"
  ON "teams" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_team_user_unique"
  ON "team_members" USING btree ("team_id", "user_id");
--> statement-breakpoint
CREATE INDEX "team_members_user_idx"
  ON "team_members" USING btree ("user_id");
--> statement-breakpoint
INSERT INTO "organization_members" (
  "organization_id",
  "user_id",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  w."organization_id",
  wm."user_id",
  (
    CASE
      WHEN bool_or(wm."status" = 'active') THEN 'active'
      WHEN bool_or(wm."status" = 'suspended') THEN 'suspended'
      ELSE 'removed'
    END
  )::"organization_member_status",
  min(wm."created_at"),
  max(wm."updated_at")
FROM "workspace_members" wm
JOIN "workspaces" w ON w."id" = wm."workspace_id"
GROUP BY w."organization_id", wm."user_id"
ON CONFLICT ("organization_id", "user_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "roles" (
  "scope_type",
  "name",
  "display_name",
  "description",
  "permissions_json",
  "is_system"
)
VALUES
  (
    'organization',
    'organization.owner',
    'Organization Owner',
    'Full control over the organization and every project it contains.',
    '["organization.get","organization.update","workspaces.get","workspaces.create","workspaces.update","members.manage","teams.manage","roles.manage","providers.manage","providers.viewMetadata","models.manage","models.view","models.invoke","agents.manage","agents.list","agents.get","agents.chat","agents.create","agents.update","agents.delete","agents.test","agents.delegate","agentVersions.manage","agentVersions.create","tools.manage","tools.view","tools.configure","tools.executeRestricted","mcpServers.manage","mcpServers.get","knowledgeBases.manage","knowledgeBases.viewAllowed","conversations.manage","conversations.create","conversations.viewOwn","usage.view","audit.view","audit.export","marketplaceItems.view","marketplaceItems.install","marketplaceItems.publish","apiKeys.manage","workflows.view","workflows.create","workflows.update","workflows.delete","workflows.execute"]'::jsonb,
    true
  ),
  (
    'workspace',
    'workspace.viewer',
    'Project Viewer',
    'Read-only access to project resources and activity.',
    '["workspaces.get","providers.viewMetadata","models.view","agents.list","agents.get","tools.view","mcpServers.get","knowledgeBases.viewAllowed","marketplaceItems.view","usage.view","audit.view","workflows.view"]'::jsonb,
    true
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "roles"
SET
  "display_name" = 'Organization Admin',
  "description" = 'Can administer organization-level settings.',
  "permissions_json" = '["organization.get","organization.update","workspaces.get","workspaces.create","workspaces.update","members.manage","teams.manage","roles.manage","audit.view"]'::jsonb,
  "updated_at" = now()
WHERE
  "scope_type" = 'organization'
  AND "name" = 'organization.admin'
  AND "is_system" = true;
--> statement-breakpoint
UPDATE "roles"
SET
  "display_name" = 'Organization Member',
  "description" = 'Can belong to organization teams and receive project-specific access.',
  "permissions_json" = '["organization.get"]'::jsonb,
  "updated_at" = now()
WHERE
  "scope_type" = 'organization'
  AND "name" = 'organization.user'
  AND "is_system" = true;
--> statement-breakpoint
UPDATE "roles"
SET
  "display_name" = 'Project Administrator',
  "description" = 'Full control over one project, including its access assignments.',
  "permissions_json" = (
    SELECT jsonb_agg(permission ORDER BY permission)
    FROM (
      SELECT jsonb_array_elements_text("permissions_json") AS permission
      UNION
      SELECT permission
      FROM (
        VALUES ('roles.manage')
      ) AS additions(permission)
    ) AS merged
  ),
  "updated_at" = now()
WHERE
  "scope_type" = 'workspace'
  AND "name" = 'workspace.admin'
  AND "is_system" = true;
--> statement-breakpoint
UPDATE "roles"
SET
  "display_name" = 'Project Editor',
  "description" = 'Can build and use project resources without managing project access.',
  "updated_at" = now()
WHERE
  "scope_type" = 'workspace'
  AND "name" = 'workspace.member'
  AND "is_system" = true;
--> statement-breakpoint
WITH owner_role AS (
  SELECT "id"
  FROM "roles"
  WHERE
    "scope_type" = 'organization'
    AND "name" = 'organization.owner'
    AND "is_system" = true
  LIMIT 1
),
organization_creators AS (
  SELECT DISTINCT ON ("organization_id")
    "organization_id",
    "created_by_user_id"
  FROM "workspaces"
  ORDER BY "organization_id", "created_at", "id"
)
INSERT INTO "role_bindings" (
  "principal_type",
  "principal_id",
  "role_id",
  "resource_type",
  "resource_id",
  "created_by_user_id"
)
SELECT DISTINCT
  'user'::"principal_type",
  creator."created_by_user_id",
  owner_role."id",
  'organization'::"role_binding_resource_type",
  creator."organization_id",
  creator."created_by_user_id"
FROM organization_creators creator
CROSS JOIN owner_role
WHERE NOT EXISTS (
  SELECT 1
  FROM "role_bindings" rb
  WHERE
    rb."principal_type" = 'user'
    AND rb."principal_id" = creator."created_by_user_id"
    AND rb."role_id" = owner_role."id"
    AND rb."resource_type" = 'organization'
    AND rb."resource_id" = creator."organization_id"
);
--> statement-breakpoint
WITH duplicate_bindings AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY
        "principal_type",
        "principal_id",
        "role_id",
        "resource_type",
        "resource_id"
      ORDER BY "created_at", "id"
    ) AS duplicate_number
  FROM "role_bindings"
)
DELETE FROM "role_bindings"
WHERE "id" IN (
  SELECT "id"
  FROM duplicate_bindings
  WHERE duplicate_number > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX "role_bindings_unique_assignment"
  ON "role_bindings" USING btree (
    "principal_type",
    "principal_id",
    "role_id",
    "resource_type",
    "resource_id"
  );
--> statement-breakpoint
WITH duplicate_custom_roles AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "owner_resource_type", "owner_resource_id", "name"
      ORDER BY "created_at", "id"
    ) AS duplicate_number
  FROM "roles"
  WHERE "is_system" = false
)
UPDATE "roles"
SET "name" = left("roles"."name", 110) || '-' || left("roles"."id"::text, 8)
FROM duplicate_custom_roles
WHERE
  "roles"."id" = duplicate_custom_roles."id"
  AND duplicate_custom_roles.duplicate_number > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "roles_owner_name_unique"
  ON "roles" USING btree (
    "owner_resource_type",
    "owner_resource_id",
    "name"
  )
  WHERE "roles"."is_system" = false;
