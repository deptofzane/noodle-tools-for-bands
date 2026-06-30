CREATE TYPE "public"."song_file_kind" AS ENUM('audio', 'sheet_music');--> statement-breakpoint
CREATE TABLE "song_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"kind" "song_file_kind" NOT NULL,
	"data" "bytea" NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"drive_file_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "song_files" ADD CONSTRAINT "song_files_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "song_files_conversation_kind_unique" ON "song_files" USING btree ("conversation_id","kind");