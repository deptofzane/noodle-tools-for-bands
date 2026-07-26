CREATE TABLE "push_mutes" (
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	CONSTRAINT "push_mutes_user_id_kind_pk" PRIMARY KEY("user_id","kind")
);
--> statement-breakpoint
ALTER TABLE "push_mutes" ADD CONSTRAINT "push_mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;