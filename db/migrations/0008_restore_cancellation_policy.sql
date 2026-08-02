UPDATE "reservations" r
SET "cancellable_until" = r.check_in_date::timestamp AT TIME ZONE p.timezone
FROM "properties" p
WHERE "cancellable_until" IS NULL
  AND p.id = r.property_id;

ALTER TABLE "reservations"
  ALTER COLUMN "cancellable_until" SET NOT NULL;
