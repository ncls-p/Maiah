CREATE TYPE "public"."workflow_status" AS ENUM('draft', 'active', 'archived');
CREATE TYPE "public"."workflow_run_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE "public"."workflow_step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');

CREATE TABLE "workflows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "status" "workflow_status" DEFAULT 'draft' NOT NULL,
  "latest_version" integer DEFAULT 1 NOT NULL,
  "active_version" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone
);

CREATE TABLE "workflow_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "definition_json" jsonb NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "workflow_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "workflow_id" uuid NOT NULL,
  "workflow_version_id" uuid NOT NULL,
  "triggered_by_user_id" uuid,
  "trigger" varchar(32) DEFAULT 'api' NOT NULL,
  "status" "workflow_run_status" DEFAULT 'queued' NOT NULL,
  "input_json" jsonb,
  "output_json" jsonb,
  "error" text,
  "idempotency_key" varchar(255),
  "queued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);

CREATE TABLE "workflow_run_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "node_id" varchar(128) NOT NULL,
  "node_type" varchar(128) NOT NULL,
  "status" "workflow_step_status" DEFAULT 'pending' NOT NULL,
  "attempt" integer DEFAULT 0 NOT NULL,
  "input_json" jsonb,
  "output_json" jsonb,
  "error" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id");
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade;
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id");
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_triggered_by_user_id_user_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null;
ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade;

CREATE INDEX "workflows_workspace_status_idx" ON "workflows" USING btree ("workspace_id", "status");
CREATE UNIQUE INDEX "workflow_versions_workflow_version_unique" ON "workflow_versions" USING btree ("workflow_id", "version");
CREATE INDEX "workflow_runs_workflow_created_idx" ON "workflow_runs" USING btree ("workflow_id", "queued_at");
CREATE INDEX "workflow_runs_workspace_status_idx" ON "workflow_runs" USING btree ("workspace_id", "status");
CREATE UNIQUE INDEX "workflow_runs_idempotency_unique" ON "workflow_runs" USING btree ("workflow_id", "idempotency_key");
CREATE UNIQUE INDEX "workflow_run_steps_run_node_unique" ON "workflow_run_steps" USING btree ("run_id", "node_id");
CREATE INDEX "workflow_run_steps_run_idx" ON "workflow_run_steps" USING btree ("run_id");

UPDATE "roles"
SET
  "permissions_json" = "permissions_json" || '["workflows.view","workflows.create","workflows.update","workflows.delete","workflows.execute"]'::jsonb,
  "updated_at" = now()
WHERE
  "scope_type" = 'workspace'
  AND "is_system" = true
  AND "name" IN ('workspace.admin', 'workspace.member');
