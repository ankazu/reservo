ALTER TABLE "reservations"
  ALTER COLUMN "cancellable_until" DROP NOT NULL;

UPDATE "reservations"
SET "cancellable_until" = NULL;
