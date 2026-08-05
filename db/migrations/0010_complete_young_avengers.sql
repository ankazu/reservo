ALTER TABLE "reservations" ADD COLUMN "access_token_hash" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_access_token_hash_unique" UNIQUE("access_token_hash");
