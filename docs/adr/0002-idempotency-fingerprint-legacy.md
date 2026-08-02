# ADR 0002: Legacy reservation idempotency fingerprints

- Status: accepted
- Date: 2026-08-02

## Decision

Reservation idempotency is bound to a canonical request fingerprint. Migration
`0003_add_request_fingerprint.sql` reconstructs fingerprints for legacy
reservations that have exactly one `ReservationItem`, because the original
request fields are available from the reservation and its historical item
snapshot.

Legacy rows without exactly one reconstructible item remain `NULL`. The
reservation service fails closed with `IDEMPOTENCY_FINGERPRINT_UNAVAILABLE`
instead of returning the reservation for an unverified payload. This prevents a
same-key, different-payload retry from bypassing the idempotency contract.

## Consequences

Reconstructible legacy reservations retain safe retry behavior after migration.
Irreconcilable legacy rows must be recreated rather than retried; this is safer
than guessing a payload or accepting an unverified idempotency key.
