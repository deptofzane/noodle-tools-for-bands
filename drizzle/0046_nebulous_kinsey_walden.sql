ALTER TABLE "events" ADD COLUMN "end_date" date;--> statement-breakpoint
CREATE INDEX "events_end_date_idx" ON "events" USING btree (coalesce("end_date", "date"));