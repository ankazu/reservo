# Inventory maintenance

Inventory operations are internal endpoints protected by
`RESERVATION_MAINTENANCE_SECRET`. Keep the endpoint behind the production internal
boundary and never expose the secret to browser code.

Inspect one room type over a half-open date range of at most 30 days:

```sh
curl -sS \
  -H "X-Maintenance-Secret: $RESERVATION_MAINTENANCE_SECRET" \
  "https://example.com/api/internal/inventory?roomTypeId=<uuid>&checkInDate=2026-08-10&checkOutDate=2026-08-12"
```

Set the absolute blocked quantity for one stay date:

```sh
curl -sS -X PUT \
  -H "Content-Type: application/json" \
  -H "X-Maintenance-Secret: $RESERVATION_MAINTENANCE_SECRET" \
  --data '{"roomTypeId":"<uuid>","stayDate":"2026-08-10","blockedQuantity":2}' \
  https://example.com/api/internal/inventory
```

Repeat the `GET` to verify the result. To unblock the date, repeat the `PUT` with
`blockedQuantity: 0`. A `409 BLOCKED_QUANTITY_EXCEEDS_CAPACITY` response means the
requested value would overlap reserved inventory; inspect the current row and use
a value no greater than `totalQuantity - reservedQuantity`.

`PUT` sets an absolute value rather than adding a delta, so retrying the same
request is safe. The operation locks the inventory row and serializes with
reservation holds.
