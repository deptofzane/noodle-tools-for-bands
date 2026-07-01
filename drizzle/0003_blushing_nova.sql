ALTER TABLE "song_files" ALTER COLUMN "data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "song_files" ADD COLUMN "storage_key" text;