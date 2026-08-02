ALTER TABLE "reservations"
  ADD COLUMN "cancellable_until" timestamp with time zone;

WITH reservation_summary AS (
  SELECT
    r.id,
    COALESCE(
      SUM(i.nightly_price * (r.check_out_date - r.check_in_date) * i.quantity),
      0
    )::integer AS subtotal_amount,
    COALESCE(SUM(i.taxes), 0)::integer AS taxes_amount,
    COALESCE(SUM(i.discounts), 0)::integer AS discounts_amount
  FROM "reservations" r
  LEFT JOIN "reservation_items" i ON i.reservation_id = r.id
  GROUP BY r.id
)
UPDATE "reservations" r
SET
  subtotal_amount = summary.subtotal_amount,
  taxes_amount = summary.taxes_amount,
  discounts_amount = summary.discounts_amount,
  total_amount = summary.subtotal_amount + summary.taxes_amount - summary.discounts_amount,
  cancellable_until = r.check_in_date::timestamp AT TIME ZONE 'Asia/Taipei'
FROM reservation_summary summary
WHERE r.id = summary.id;

ALTER TABLE "reservations"
  ALTER COLUMN "cancellable_until" SET NOT NULL;
