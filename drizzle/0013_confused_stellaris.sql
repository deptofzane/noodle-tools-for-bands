CREATE TABLE "band_chat_reads" (
	"user_id" uuid NOT NULL,
	"band_id" uuid NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "band_chat_reads_user_id_band_id_pk" PRIMARY KEY("user_id","band_id")
);
--> statement-breakpoint
CREATE TABLE "band_message_mentions" (
	"message_id" uuid NOT NULL,
	"mentioned_user_id" uuid NOT NULL,
	CONSTRAINT "band_message_mentions_message_id_mentioned_user_id_pk" PRIMARY KEY("message_id","mentioned_user_id")
);
--> statement-breakpoint
ALTER TABLE "band_messages" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "band_chat_reads" ADD CONSTRAINT "band_chat_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "band_chat_reads" ADD CONSTRAINT "band_chat_reads_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "band_message_mentions" ADD CONSTRAINT "band_message_mentions_message_id_band_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."band_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "band_message_mentions" ADD CONSTRAINT "band_message_mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "band_message_mentions_user_idx" ON "band_message_mentions" USING btree ("mentioned_user_id");