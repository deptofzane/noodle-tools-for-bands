CREATE TYPE "public"."todo_status" AS ENUM('active', 'complete', 'cancelled');--> statement-breakpoint
CREATE TABLE "todo_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL,
	"kind" "user_note_link_kind" NOT NULL,
	"target_id" uuid,
	"url" text,
	"label" text NOT NULL,
	"practice" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "todo_status" DEFAULT 'active' NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"owner_id" uuid,
	"deadline" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "todo_links" ADD CONSTRAINT "todo_links_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "todo_links_todo_idx" ON "todo_links" USING btree ("todo_id");--> statement-breakpoint
CREATE INDEX "todos_band_status_idx" ON "todos" USING btree ("band_id","status");--> statement-breakpoint
CREATE INDEX "todos_band_owner_idx" ON "todos" USING btree ("band_id","owner_id") WHERE shared;--> statement-breakpoint
CREATE INDEX "todos_band_creator_idx" ON "todos" USING btree ("band_id","creator_id");