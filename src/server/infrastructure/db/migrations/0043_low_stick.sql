ALTER TABLE "organizations" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "theme" varchar(32) DEFAULT 'ocean' NOT NULL;