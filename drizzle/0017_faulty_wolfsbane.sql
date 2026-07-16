DROP INDEX "accounts_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_provider_unique" ON "accounts" USING btree ("user_id","provider");