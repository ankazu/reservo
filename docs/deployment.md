# Production deployment

Reservo deploys as one Node.js application with PostgreSQL 16. Use an immutable
application artifact and run exactly the checked-in migrations before directing
traffic to the new release.

## Required configuration

- `DATABASE_URL`: least-privilege PostgreSQL connection for the application.
- `RESERVATION_MAINTENANCE_SECRET`: long random secret shared only with internal
  confirmation, inventory, and expiration jobs.
- `RESERVO_BASE_URL`: externally reachable application origin used by the
  expiration runner, such as `https://reservations.example.com`.
- `RESERVO_TRUST_PROXY=true` only when the trusted reverse proxy removes and
  rebuilds the forwarded client-IP headers.

## Release procedure

From the exact revision being deployed:

```sh
npm ci --include=dev --include=optional
npm run db:check
npm run db:migrate
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run build
```

`db:migrate` is forward-only. Take a PostgreSQL backup before migration. If the
application rollout fails after a compatible migration, restore the previous
application artifact and leave the migration applied. A destructive or
backward-incompatible migration requires its own expand/contract ADR and rollback
procedure before deployment.

Start `.output/server/index.mjs`, then require `GET /api/health` to return HTTP 200
and `{ "success": true, "data": { "status": "ok", "database": "up" } }`
before adding the instance to the load balancer. HTTP 503 means the instance is
not ready and must receive no guest traffic.

## Expiration scheduler

Run this checked-in command every minute in the hosting scheduler:

```sh
npm run maintenance:expire
```

The job retries network and HTTP failures three times and exits non-zero after the
retry budget is exhausted. Capture its JSON stdout/stderr. Alert when:

- no `expiration_scheduler_succeeded` event has arrived for three minutes;
- `expiration_scheduler_failed` occurs;
- `backlogCount` remains above zero for three consecutive successful runs.

The application also emits `reservation_expiration_completed`,
`reservation_expiration_failed`, and `health_check_failed` JSON events. Never log
the maintenance secret, guest access token, Authorization header, or guest PII.

## Post-deployment verification

1. Confirm the deployed revision and migration command succeeded.
2. Call `GET /api/health` through the production load balancer.
3. Run `npm run maintenance:expire` once and retain its structured report.
4. Confirm the scheduler records a success within one minute and that backlog is
   stable or decreasing.
5. Exercise a synthetic search and hold with test guest data, then cancel it with
   its access token so inventory is released.
