# Reservation expiration maintenance

Set `RESERVATION_MAINTENANCE_SECRET` in the server environment and configure
the hosting platform to `POST` this endpoint at least once per minute:

```sh
curl -X POST \
  -H "X-Maintenance-Secret: $RESERVATION_MAINTENANCE_SECRET" \
  https://example.com/api/internal/reservations/expire
```

The endpoint processes up to 100 expired `PENDING_PAYMENT` reservations per
run. PostgreSQL row locks with `SKIP LOCKED` allow multiple scheduler calls to
run safely; cancellation and expiration remain repeatable and release each
reservation's inventory at most once.
