CREATE TABLE "workflow_agent_run_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "title" varchar(255) NOT NULL,
  "reason" text,
  "input_encrypted" text NOT NULL,
  "input_preview_json" jsonb NOT NULL,
  "expected_version" integer NOT NULL,
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "run_id" uuid,
  "error" text,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone
);

ALTER TABLE "workflow_agent_run_requests" ADD CONSTRAINT "workflow_agent_run_requests_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade;
ALTER TABLE "workflow_agent_run_requests" ADD CONSTRAINT "workflow_agent_run_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "workflow_agent_run_requests" ADD CONSTRAINT "workflow_agent_run_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
ALTER TABLE "workflow_agent_run_requests" ADD CONSTRAINT "workflow_agent_run_requests_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null;

CREATE INDEX "workflow_agent_run_requests_pending_idx" ON "workflow_agent_run_requests" USING btree ("workflow_id", "user_id", "status", "created_at");
CREATE INDEX "workflow_agent_run_requests_workspace_idx" ON "workflow_agent_run_requests" USING btree ("workspace_id");
CREATE UNIQUE INDEX "workflow_agent_run_requests_run_unique" ON "workflow_agent_run_requests" USING btree ("run_id");

CREATE TABLE "workflow_agent_todo_lists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "todo_list_json" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "workflow_agent_todo_lists" ADD CONSTRAINT "workflow_agent_todo_lists_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade;
ALTER TABLE "workflow_agent_todo_lists" ADD CONSTRAINT "workflow_agent_todo_lists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "workflow_agent_todo_lists" ADD CONSTRAINT "workflow_agent_todo_lists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;

CREATE UNIQUE INDEX "workflow_agent_todo_lists_workflow_user_unique" ON "workflow_agent_todo_lists" USING btree ("workflow_id", "user_id");
CREATE INDEX "workflow_agent_todo_lists_workspace_idx" ON "workflow_agent_todo_lists" USING btree ("workspace_id");
