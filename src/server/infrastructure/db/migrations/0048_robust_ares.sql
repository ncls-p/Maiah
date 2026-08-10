CREATE TYPE "public"."conversation_share_continuation_mode" AS ENUM('shared', 'fork');--> statement-breakpoint
CREATE TABLE "conversation_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"shared_by_user_id" uuid NOT NULL,
	"shared_with_user_id" uuid NOT NULL,
	"can_continue" boolean DEFAULT false NOT NULL,
	"continuation_mode" "conversation_share_continuation_mode" DEFAULT 'fork' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_agent_preferences" ADD COLUMN "hidden_agent_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "is_ephemeral" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "public_share_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "public_shared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversation_shares" ADD CONSTRAINT "conversation_shares_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_shares" ADD CONSTRAINT "conversation_shares_shared_by_user_id_user_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_shares" ADD CONSTRAINT "conversation_shares_shared_with_user_id_user_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_shares_conversation_user_unique" ON "conversation_shares" USING btree ("conversation_id","shared_with_user_id");--> statement-breakpoint
CREATE INDEX "conversation_shares_recipient" ON "conversation_shares" USING btree ("shared_with_user_id","conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_public_share_id_unique" ON "conversations" USING btree ("public_share_id");--> statement-breakpoint
CREATE INDEX "conversations_ephemeral_expiry" ON "conversations" USING btree ("is_ephemeral","expires_at");