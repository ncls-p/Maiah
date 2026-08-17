CREATE TABLE "conversation_read_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_read_states_conversation_user_unique" ON "conversation_read_states" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "conversation_read_states_user_conversation" ON "conversation_read_states" USING btree ("user_id","conversation_id");--> statement-breakpoint
INSERT INTO "conversation_read_states" ("conversation_id", "user_id", "last_read_at")
SELECT "id", "user_id", now() FROM "conversations"
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "conversation_read_states" ("conversation_id", "user_id", "last_read_at")
SELECT "conversation_id", "shared_with_user_id", now() FROM "conversation_shares"
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;
