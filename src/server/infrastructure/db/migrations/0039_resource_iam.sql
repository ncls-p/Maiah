ALTER TYPE "public"."role_binding_resource_type" ADD VALUE IF NOT EXISTS 'model';
--> statement-breakpoint
ALTER TYPE "public"."role_binding_resource_type" ADD VALUE IF NOT EXISTS 'tool_connector';
--> statement-breakpoint
ALTER TYPE "public"."role_binding_resource_type" ADD VALUE IF NOT EXISTS 'tool_connection';
--> statement-breakpoint
ALTER TYPE "public"."role_binding_resource_type" ADD VALUE IF NOT EXISTS 'custom_tool';
--> statement-breakpoint
ALTER TYPE "public"."role_binding_resource_type" ADD VALUE IF NOT EXISTS 'skill';
--> statement-breakpoint
ALTER TYPE "public"."role_binding_resource_type" ADD VALUE IF NOT EXISTS 'workflow';
--> statement-breakpoint
ALTER TYPE "public"."role_binding_resource_type" ADD VALUE IF NOT EXISTS 'scheduled_task';
--> statement-breakpoint
ALTER TYPE "public"."role_binding_resource_type" ADD VALUE IF NOT EXISTS 'conversation';
