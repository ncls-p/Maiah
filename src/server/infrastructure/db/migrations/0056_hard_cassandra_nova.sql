-- Close the write gap between duplicate cleanup and unique-index creation.
-- Reads remain available while new active assistant inserts wait for commit.
LOCK TABLE "messages" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
WITH "ranked_active_assistants" AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "conversation_id"
		ORDER BY "created_at" DESC, "id" DESC
	) AS "active_rank"
	FROM "messages"
	WHERE "role" = 'assistant' AND "status" IN ('pending', 'streaming')
)
UPDATE "messages"
SET "status" = 'failed', "completed_at" = now()
WHERE "id" IN (
	SELECT "id" FROM "ranked_active_assistants" WHERE "active_rank" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "messages_one_active_assistant_per_conversation" ON "messages" USING btree ("conversation_id") WHERE "messages"."role" = 'assistant' AND "messages"."status" IN ('pending', 'streaming');
