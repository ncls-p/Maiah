ALTER TABLE "usage_events" ADD COLUMN "billing_workspace_id" uuid;--> statement-breakpoint
CREATE INDEX "usage_events_billing_created_idx" ON "usage_events" USING btree ("billing_workspace_id","created_at");--> statement-breakpoint
-- Preserve the consuming project of existing shared-assistant conversations.
UPDATE usage_events AS event
SET billing_workspace_id = coalesce(conversation.billing_workspace_id, event.workspace_id)
FROM conversations AS conversation
WHERE event.conversation_id = conversation.id AND event.billing_workspace_id IS NULL;
--> statement-breakpoint
UPDATE usage_events SET billing_workspace_id = workspace_id WHERE billing_workspace_id IS NULL;
