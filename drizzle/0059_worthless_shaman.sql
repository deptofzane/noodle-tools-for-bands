CREATE TABLE "event_reminder_prefs" (
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "event_reminder_prefs_user_id_category_kind_pk" PRIMARY KEY("user_id","category","kind")
);
--> statement-breakpoint
ALTER TABLE "event_reminder_prefs" ADD CONSTRAINT "event_reminder_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;