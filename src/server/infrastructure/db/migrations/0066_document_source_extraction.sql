ALTER TABLE "documents" ADD COLUMN "source_extraction_pending" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "extraction_warning" text;
