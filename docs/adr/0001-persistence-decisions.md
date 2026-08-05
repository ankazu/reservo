# ADR 0001: Reservo MVP persistence decisions

- Status: accepted
- Date: 2026-08-02
- Amended: 2026-08-05（更正 Drizzle schema 的實際單檔路徑）

## Context

The next implementation slice introduces reservation persistence and inventory
consistency. The MVP is a single Nuxt application backed by PostgreSQL, so the
choices below keep database-specific behavior behind repositories while leaving
the API and services easy to test.

## Decisions

### ORM and migration workflow

Use Drizzle ORM with PostgreSQL and Drizzle Kit migrations. Drizzle schema
definitions live in `db/schema.ts`, migrations live under `db/migrations`, and
repositories are the only application layer allowed to import the database
client or Drizzle query helpers.

### Money representation

Persist monetary amounts as integer minor units. The MVP currency is TWD, whose
minor-unit exponent is zero, so a stored `4200` means NT$4,200. API contracts
will expose integer TWD amounts and will never calculate persisted totals with
JavaScript floating-point values.

### Date and time policy

Stay dates are ISO calendar dates (`YYYY-MM-DD`) interpreted in the property's
local timezone, Asia/Taipei for this MVP. Availability uses the half-open
interval `[checkInDate, checkOutDate)`, and all date-only calculations operate on
UTC-normalized calendar values to avoid daylight-saving assumptions leaking into
night counts.

Reservation timestamps such as `createdAt` and `expiresAt` are stored as UTC
timestamps.

### Inventory provisioning

`room_inventory` is a materialized daily availability table. The initial
migration seeds the MVP room types, while the reservation and availability
services idempotently create missing stay-date rows from the room count for
that room type. Inserts use the `(room_type_id, stay_date)` unique constraint
with `ON CONFLICT DO NOTHING`; the reservation transaction still locks every
relevant row before checking and incrementing reserved quantity.

### Authentication boundary

Authentication is outside the MVP. A reservation may be created for a guest
provided name and email, but the server must not treat either field as proof of
identity. The API is structured so an authenticated guest identifier can be
added later without changing reservation or inventory rules.

### Payment behavior

Payment-provider integration is outside the MVP. A newly created reservation is
`PENDING_PAYMENT` with an `expiresAt`; confirmation is an explicit service/API
operation that can later be connected to a payment event. No card or payment
credentials are stored by Reservo.

### Cancellation policy

The MVP uses `reservations.cancellable_until` for the cancellation policy. A
reservation is cancellable strictly before the check-in date at 00:00 in the
fixed MVP timezone `Asia/Taipei`; the check-in instant itself is not
cancellable. New reservations persist this timestamp, and cancellation
transitions enforce it. The column is non-null for persisted reservations.
Migration `0009_normalize_cancellation_timezone` corrects rows that can be
identified as having been derived from a property's timezone, while preserving
deadlines that may have been explicitly customized. This identification is a
heuristic: without a provenance column, a customized deadline that happens to
equal the legacy value cannot be distinguished and will also be normalized.
Likewise, if a property's timezone changed after a reservation was created,
the current property timezone cannot reliably identify the old value; such rows
are left unchanged. Timezones not present in PostgreSQL's `pg_timezone_names`
view are also skipped. Adding provenance is deferred because it requires a new
schema and cannot recover the source of existing rows.

## Consequences

- PostgreSQL transactions and row locks remain in the reservation service and
  repository boundary, rather than leaking into route handlers.
- TWD-only integer amounts keep the first release precise and simple; adding a
  currency later requires an explicit scope decision.
- Guest checkout can ship without inventing account or session semantics.
- A future payment integration can confirm an existing pending reservation
  without changing inventory accounting rules.
