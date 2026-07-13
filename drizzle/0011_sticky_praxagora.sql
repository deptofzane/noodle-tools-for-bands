DROP INDEX "song_files_conversation_kind_unique";--> statement-breakpoint
ALTER TABLE "song_files" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "song_files" ADD COLUMN "label" text;--> statement-breakpoint
CREATE INDEX "song_files_conversation_idx" ON "song_files" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "song_files_conversation_sheet_unique" ON "song_files" USING btree ("conversation_id") WHERE kind = 'sheet_music';--> statement-breakpoint
CREATE UNIQUE INDEX "song_files_default_audio_unique" ON "song_files" USING btree ("conversation_id") WHERE kind = 'audio' and is_default;--> statement-breakpoint
--> Backfill: every existing song has exactly one audio row today, so mark it the default.
UPDATE "song_files" SET "is_default" = true WHERE "kind" = 'audio';