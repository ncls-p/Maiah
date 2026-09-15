ALTER TYPE provider_kind ADD VALUE IF NOT EXISTS 'amazon-bedrock';
ALTER TABLE ai_providers ADD COLUMN bedrock_config_json jsonb;
ALTER TABLE ai_providers ADD COLUMN encrypted_aws_credentials text;

--> statement-breakpoint
ALTER TABLE ai_models ADD COLUMN description text;
--> statement-breakpoint
ALTER TABLE ai_models ADD COLUMN tags text[];

--> statement-breakpoint
ALTER TABLE ai_providers ADD COLUMN description text;
--> statement-breakpoint
ALTER TABLE ai_providers ADD COLUMN tags text[];
