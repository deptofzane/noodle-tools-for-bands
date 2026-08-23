ALTER TABLE "user_notes" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_notes" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "user_notes_band_pinned_idx" ON "user_notes" USING btree ("band_id","pinned_at" DESC NULLS LAST) WHERE pinned;