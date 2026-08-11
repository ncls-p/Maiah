ALTER TABLE "knowledge_bases" ADD COLUMN "visibility" varchar(32) DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "visibility" varchar(32) DEFAULT 'private' NOT NULL;--> statement-breakpoint
UPDATE "knowledge_bases" SET "visibility" = 'organization' WHERE "is_global" = true;--> statement-breakpoint
UPDATE "mcp_servers" SET "visibility" = 'organization' WHERE "is_global" = true;