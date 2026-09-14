ALTER TABLE workflow_runs ADD COLUMN parent_run_id uuid REFERENCES workflow_runs(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE workflow_runs ADD COLUMN child_runs_started integer NOT NULL DEFAULT 0;
