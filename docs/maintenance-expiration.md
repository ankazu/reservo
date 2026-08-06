# Reservation expiration maintenance

Set `RESERVO_BASE_URL` and `RESERVATION_MAINTENANCE_SECRET` in the scheduler
environment and run the retrying maintenance client at least once per minute:

```sh
npm run maintenance:expire
```

For a manual probe, call the endpoint directly:

```sh
curl -X POST \
  -H "X-Maintenance-Secret: $RESERVATION_MAINTENANCE_SECRET" \
  https://example.com/api/internal/reservations/expire
```

The endpoint processes up to 100 expired `PENDING_PAYMENT` reservations per run
and returns `completedAt`, `expiredCount`, and the remaining `backlogCount`.
PostgreSQL row locks with `SKIP LOCKED` allow multiple scheduler calls to run
safely; cancellation and expiration remain repeatable and release each
reservation's inventory at most once.

The checked-in client retries three times and emits either
`expiration_scheduler_succeeded` with the report or
`expiration_scheduler_failed` before exiting non-zero. Alert when no success is
seen for three minutes, on any terminal failure, or when backlog remains above
zero for three consecutive successful runs. Deployment and health-check steps
are documented in [Production deployment](deployment.md).
