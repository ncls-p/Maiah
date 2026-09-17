ALTER TABLE "workflows"
  ADD COLUMN "visibility" varchar(32) DEFAULT 'private' NOT NULL,
  ADD COLUMN "is_global" boolean DEFAULT false NOT NULL;

-- Preserve the project-wide access of existing workflows. New workflows default to private.
UPDATE "workflows" SET "visibility" = 'workspace', "is_global" = true;

CREATE INDEX "workflows_workspace_visibility_idx"
  ON "workflows" ("workspace_id", "visibility")
  WHERE "archived_at" IS NULL;

INSERT INTO "roles" (
  "scope_type", "name", "display_name", "description", "permissions_json", "is_system"
) VALUES (
  'workspace', 'workspace.workflow_user', 'Workflow User',
  'Can view and run one explicitly shared workflow.',
  '["workflows.view","workflows.execute"]'::jsonb, true
) ON CONFLICT DO NOTHING;
