ALTER TABLE "mcp_servers"
ADD COLUMN "require_approval" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "mcp_tools"
ADD COLUMN "require_approval" boolean NOT NULL DEFAULT false;
