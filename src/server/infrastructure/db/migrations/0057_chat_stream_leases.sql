ALTER TABLE "messages" ADD COLUMN "stream_generation_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "stream_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "stream_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "stream_lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "agent_runs_message_status" ON "agent_runs" USING btree ("message_id","status");--> statement-breakpoint
CREATE INDEX "messages_active_stream_lease" ON "messages" USING btree ("status","stream_lease_expires_at");--> statement-breakpoint
-- Give streams created by the previous release a bounded handover window.
-- Old producers cannot heartbeat these columns, so healthy requests may finish
-- during the rollout while abandoned rows become reapable after five minutes.
-- Keep their generation identity NULL: this is the explicit, bounded legacy
-- marker used by stop/resume routes. Every stream created by the new runtime
-- receives a non-NULL generation UUID and is always fenced by that identity.
UPDATE "messages"
SET
	"stream_started_at" = COALESCE("created_at", clock_timestamp()),
	"stream_heartbeat_at" = clock_timestamp(),
	"stream_lease_expires_at" = clock_timestamp() + interval '5 minutes'
WHERE
	"role" = 'assistant'
	AND "status" IN ('pending', 'streaming')
	AND "stream_lease_expires_at" IS NULL;--> statement-breakpoint
-- Existing shared-continuation races may have created more than one fork for
-- the same recipient. Preserve every conversation, but keep the most recently
-- active fork visible and soft-archive the older duplicates before enforcing
-- the invariant. The explicit lock closes the write gap between cleanup and
-- unique-index creation while continuing to allow reads.
LOCK TABLE "conversations" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
WITH "ranked_shared_forks" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "parent_conversation_id", "user_id"
			ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
		) AS "duplicate_rank"
	FROM "conversations"
	WHERE
		"parent_conversation_id" IS NOT NULL
		AND "branch_kind" = 'shared_continuation'
		AND "status" = 'active'
		AND "archived_at" IS NULL
)
UPDATE "conversations" AS "conversation"
SET
	"status" = 'archived',
	"archived_at" = clock_timestamp(),
	"updated_at" = clock_timestamp()
FROM "ranked_shared_forks"
WHERE
	"conversation"."id" = "ranked_shared_forks"."id"
	AND "ranked_shared_forks"."duplicate_rank" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_one_shared_fork_per_recipient" ON "conversations" USING btree ("parent_conversation_id","user_id") WHERE "conversations"."branch_kind" = 'shared_continuation' AND "conversations"."status" = 'active' AND "conversations"."archived_at" IS NULL;
