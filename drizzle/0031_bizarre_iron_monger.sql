CREATE TABLE "sheet_version_prefs" (
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sheet_version_prefs_user_id_conversation_id_pk" PRIMARY KEY("user_id","conversation_id")
);
--> statement-breakpoint
DROP INDEX "song_files_conversation_sheet_unique";--> statement-breakpoint
ALTER TABLE "sheet_version_prefs" ADD CONSTRAINT "sheet_version_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_version_prefs" ADD CONSTRAINT "sheet_version_prefs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_version_prefs" ADD CONSTRAINT "sheet_version_prefs_version_id_song_files_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."song_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: existing single sheet-music rows become their song's default version.
UPDATE "song_files" SET "is_default" = true WHERE "kind" = 'sheet_music';--> statement-breakpoint
CREATE UNIQUE INDEX "song_files_default_sheet_unique" ON "song_files" USING btree ("conversation_id") WHERE kind = 'sheet_music' and is_default;