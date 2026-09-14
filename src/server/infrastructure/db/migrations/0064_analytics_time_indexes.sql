-- Time-window reporting and stable event pagination at project and deployment scope.
CREATE INDEX IF NOT EXISTS usage_events_created_id_idx ON usage_events (created_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS usage_events_workspace_created_id_idx ON usage_events (workspace_id, created_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_events_created_id_idx ON audit_events (created_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_events_organization_created_idx ON audit_events (organization_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_events_workspace_created_id_idx ON audit_events (workspace_id, created_at, id);
