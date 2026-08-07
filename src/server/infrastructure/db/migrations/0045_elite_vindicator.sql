ALTER TYPE "public"."message_part_type" ADD VALUE 'summary';--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "summary_encrypted" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "summary_through_message_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "summary_token_count" integer;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "summary_updated_at" timestamp with time zone;