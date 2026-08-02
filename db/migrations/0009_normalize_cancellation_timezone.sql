-- Corrective migration for databases that already applied 0006/0008 while
-- cancellation deadlines were derived from property.timezone.
UPDATE "reservations"
SET "cancellable_until" = "check_in_date"::timestamp AT TIME ZONE 'Asia/Taipei';

ALTER TABLE "reservations"
  ALTER COLUMN "cancellable_until" SET NOT NULL;
