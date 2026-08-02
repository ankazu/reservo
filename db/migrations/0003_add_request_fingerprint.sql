ALTER TABLE "reservations"
ADD COLUMN "request_fingerprint" text;

-- Rebuild fingerprints for legacy reservations with exactly one item.
WITH reconstructible AS (
  SELECT
    r.id,
    replace(
      replace(
        json_build_object(
          'propertyId', r.property_id::text,
          'roomTypeId', i.room_type_id::text,
          'checkInDate', r.check_in_date::text,
          'checkOutDate', r.check_out_date::text,
          'quantity', i.quantity,
          'guestName', r.guest_name,
          'guestEmail', r.guest_email,
          'ratePlanName', i.rate_plan_name_snapshot
        )::text,
        ' : ',
        ':'
      ),
      ', ',
      ','
    ) AS fingerprint
  FROM reservations r
  JOIN reservation_items i ON i.reservation_id = r.id
  WHERE r.request_fingerprint IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM reservation_items duplicate
      WHERE duplicate.reservation_id = r.id
        AND duplicate.id <> i.id
    )
)
UPDATE reservations r
SET request_fingerprint = reconstructible.fingerprint
FROM reconstructible
WHERE r.id = reconstructible.id;

-- Rows without one reconstructible item remain NULL and are rejected by the
-- service with IDEMPOTENCY_FINGERPRINT_UNAVAILABLE.
