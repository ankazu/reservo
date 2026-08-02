ALTER TABLE "reservations"
  ADD COLUMN "guest_count" integer NOT NULL DEFAULT 1,
  ADD COLUMN "subtotal_amount" integer NOT NULL DEFAULT 0,
  ADD COLUMN "taxes_amount" integer NOT NULL DEFAULT 0,
  ADD COLUMN "discounts_amount" integer NOT NULL DEFAULT 0,
  ADD COLUMN "total_amount" integer NOT NULL DEFAULT 0;
