ALTER TYPE "public"."message_part_type" ADD VALUE 'impact';--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "image_generation_config_json" jsonb;--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "sustainability_config_json" jsonb;