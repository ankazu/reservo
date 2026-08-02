UPDATE "reservations" r
SET "cancellable_until" = r.check_in_date::timestamp AT TIME ZONE 'Asia/Taipei'
WHERE "cancellable_until" IS NULL;

ALTER TABLE "reservations"
  ALTER COLUMN "cancellable_until" SET NOT NULL;
