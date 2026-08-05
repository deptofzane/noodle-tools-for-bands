ALTER TABLE "notifications" ADD COLUMN "day" text;--> statement-breakpoint
CREATE INDEX "notifications_band_day_idx" ON "notifications" USING btree ("band_id","day");