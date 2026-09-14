ALTER TABLE scheduled_tasks ALTER COLUMN agent_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE scheduled_tasks ADD COLUMN workflow_id uuid REFERENCES workflows(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE scheduled_tasks ADD COLUMN workflow_input_json jsonb;
--> statement-breakpoint
ALTER TABLE scheduled_tasks ADD COLUMN last_workflow_run_id uuid REFERENCES workflow_runs(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE scheduled_tasks ADD CONSTRAINT scheduled_tasks_one_target CHECK (num_nonnulls(agent_id, workflow_id) = 1);
