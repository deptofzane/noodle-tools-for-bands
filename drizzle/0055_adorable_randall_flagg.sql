ALTER TYPE "public"."notification_kind" ADD VALUE 'todo-assigned';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'todo-completed';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'todo-cancelled';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'todo-taken-private';--> statement-breakpoint
ALTER TYPE "public"."notification_subject" ADD VALUE 'todo';