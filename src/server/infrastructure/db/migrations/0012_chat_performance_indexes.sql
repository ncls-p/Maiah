CREATE INDEX IF NOT EXISTS "conversations_user_workspace_updated" ON "conversations" USING btree ("user_id","workspace_id","status","archived_at","updated_at" DESC,"id" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_created" ON "messages" USING btree ("conversation_id","created_at");
