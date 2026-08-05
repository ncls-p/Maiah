ALTER TABLE "document_embeddings" ADD COLUMN "embedding_json" jsonb;--> statement-breakpoint
ALTER TABLE "document_embeddings" ADD COLUMN "embedding_dimensions" integer;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "rag_config_json" jsonb;