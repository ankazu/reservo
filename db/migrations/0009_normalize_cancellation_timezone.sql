-- NULL deadlines are invalid legacy data and can be safely assigned the fixed
-- MVP policy before the NOT NULL constraint is restored.
UPDATE "reservations"
SET "cancellable_until" = "check_in_date"::timestamp AT TIME ZONE 'Asia/Taipei'
WHERE "cancellable_until" IS NULL;

-- Corrective migration for rows whose deadline matches the old
-- property-timezone-derived policy. This is a heuristic: customized deadlines
-- with a different value are preserved, but a customized deadline that happens
-- to equal the legacy value cannot be distinguished and is normalized too.
WITH valid_properties AS (
  SELECT p."id", p."timezone"
  FROM "properties" p
  JOIN pg_timezone_names tz ON tz."name" = p."timezone"
)
UPDATE "reservations" r
SET "cancellable_until" = r."check_in_date"::timestamp AT TIME ZONE 'Asia/Taipei'
FROM valid_properties p
WHERE p."id" = r."property_id"
  AND r."cancellable_until" =
    r."check_in_date"::timestamp AT TIME ZONE p."timezone";

ALTER TABLE "reservations"
  ALTER COLUMN "cancellable_until" SET NOT NULL;
