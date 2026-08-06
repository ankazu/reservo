# ADR 0005: Inventory operations boundary

- Status: accepted
- Date: 2026-08-06

## Context

The property needs a minimum safe way to inspect daily inventory and take rooms
out of sale for maintenance or stop-sell periods. A complete admin platform and
staff authentication system are outside the MVP, while direct database edits do
not provide a safe or verifiable operational boundary.

## Decisions

Inventory operations use internal HTTP endpoints protected by the same
`X-Maintenance-Secret` boundary as fake-payment confirmation and reservation
expiration. These endpoints must not be exposed as public guest APIs.

`GET /api/internal/inventory` reports `total`, `reserved`, `blocked`, and
calculated `available` quantities for one room type over a half-open date range.
The range is limited to 30 dates per request.

`PUT /api/internal/inventory` sets the absolute blocked quantity for one room type
and stay date. Setting an absolute value makes retries idempotent; setting it to
zero unblocks the date. The service provisions the inventory row, locks it with
`FOR UPDATE`, and rejects any change for which `reserved + blocked > total`.
Reservation holds use the same row lock, so concurrent holds and block operations
serialize without overselling.

## Consequences

- Operators can block, verify, and restore inventory without editing PostgreSQL.
- The maintenance secret grants powerful operational access and must be stored,
  transmitted, and rotated as a production secret.
- There is no staff identity, role separation, or audit log in this MVP. A future
  admin platform must replace this shared-secret boundary rather than treating it
  as end-user authentication.
