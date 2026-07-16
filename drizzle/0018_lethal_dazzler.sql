ALTER TABLE "setlist_songs" DROP CONSTRAINT "setlist_songs_setlist_id_conversation_id_pk";--> statement-breakpoint
ALTER TABLE "setlist_songs" ALTER COLUMN "conversation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD COLUMN "label" text;--> statement-breakpoint
CREATE UNIQUE INDEX "setlist_songs_setlist_conversation_unique" ON "setlist_songs" USING btree ("setlist_id","conversation_id") WHERE conversation_id is not null;