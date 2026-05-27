ALTER TABLE "agents" ADD COLUMN "sharing_mode" varchar(32) DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "share_target_user_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "is_global" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "is_recommended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "curation_label" varchar(64);--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_share_target_user_id_user_id_fk" FOREIGN KEY ("share_target_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;