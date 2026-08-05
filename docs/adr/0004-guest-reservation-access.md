# ADR 0004: Guest reservation access tokens

- Status: accepted
- Date: 2026-08-05

## Context

Guest checkout has no account or session that can authorize reservation reads or
mutations. A reservation UUID is an identifier, not a credential, and the guest
email is not proof of identity. The MVP needs a credential that a guest can save
and present later without adding authentication infrastructure.

## Decisions

Each new reservation receives a cryptographically random 256-bit access token.
The API returns its base64url plaintext only in the successful response that
first creates the reservation. PostgreSQL stores only its SHA-256 hash in
`reservations.access_token_hash`; idempotent replays return the reservation but
cannot recover or return the plaintext token.

The create response also includes a relative details URL whose token is in the
URL fragment. Fragments are not sent in HTTP requests, so the client reads the
fragment and sends the token to protected APIs using `Authorization: Bearer`.
Tokens must not be placed in query strings or server logs.

Reservation lookup and guest cancellation require both reservation UUID and
access token. Missing, malformed, wrong-reservation, and unknown-reservation
credentials all return the same `404 RESERVATION_NOT_FOUND` response so the API
does not disclose whether a UUID exists. Token comparison is constant-time.

Confirmation is an internal payment operation protected by the existing
maintenance secret for the fake-payment MVP. Individual public expiration is
removed; expiration remains available only through the protected batch endpoint.

Existing reservations receive a null token hash during migration and are
therefore intentionally inaccessible through guest endpoints. There is no safe
way to derive or deliver a credential for rows created before this decision.

## Consequences

- Losing the one-time token or its fragment URL means the guest cannot recover
  access in this MVP; manual support recovery remains out of scope.
- A network failure after a hold commits but before its first response can lose
  the token even though an idempotent retry finds the reservation. This follows
  the one-time plaintext requirement and should be revisited with an encrypted
  delivery mechanism if product requirements demand automatic recovery.
- Access-token hashes are sensitive authorization data even though they are not
  plaintext and must never be exposed in API responses or logs.
