CREATE TYPE "public"."notification_kind" AS ENUM('song-comment', 'chat-message', 'show-added', 'song-updated', 'show-updated', 'band-updated');--> statement-breakpoint
CREATE TYPE "public"."notification_subject" AS ENUM('conversation', 'event', 'band');--> statement-breakpoint
CREATE TABLE "notification_reads" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_name" text,
	"band_name" text,
	"kind" "notification_kind" NOT NULL,
	"subject_type" "notification_subject" NOT NULL,
	"subject_id" uuid,
	"subject_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_band_created_idx" ON "notifications" USING btree ("band_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");