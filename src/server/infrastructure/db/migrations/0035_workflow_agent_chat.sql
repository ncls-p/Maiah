CREATE TABLE "workflow_agent_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" varchar(16) NOT NULL,
  "content_encrypted" text NOT NULL,
  "model_content_encrypted" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "workflow_agent_input_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "fields_json" jsonb NOT NULL,
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "values_encrypted" text,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "submitted_at" timestamp with time zone,
  "consumed_at" timestamp with time zone
);

ALTER TABLE "workflow_agent_messages" ADD CONSTRAINT "workflow_agent_messages_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade;
ALTER TABLE "workflow_agent_messages" ADD CONSTRAINT "workflow_agent_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "workflow_agent_messages" ADD CONSTRAINT "workflow_agent_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
ALTER TABLE "workflow_agent_input_requests" ADD CONSTRAINT "workflow_agent_input_requests_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade;
ALTER TABLE "workflow_agent_input_requests" ADD CONSTRAINT "workflow_agent_input_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "workflow_agent_input_requests" ADD CONSTRAINT "workflow_agent_input_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;

CREATE INDEX "workflow_agent_messages_history_idx" ON "workflow_agent_messages" USING btree ("workflow_id", "user_id", "created_at");
CREATE INDEX "workflow_agent_input_requests_pending_idx" ON "workflow_agent_input_requests" USING btree ("workflow_id", "user_id", "status", "created_at");
CREATE INDEX "workflow_agent_input_requests_workspace_idx" ON "workflow_agent_input_requests" USING btree ("workspace_id");
