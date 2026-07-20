ALTER TYPE "public"."notification_kind" ADD VALUE 'poll-cancelled' BEFORE 'setlist-created';--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "closed_at" timestamp with time zone;