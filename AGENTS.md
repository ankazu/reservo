# AGENTS.md

## Project overview

This repository contains a reservation-system MVP built as a single Nuxt application.
The intended stack is Nuxt, Vue 3, TypeScript, Nitro Server, PostgreSQL, Zod, and Vitest.
Playwright may be added for important end-to-end reservation flows.

Use Nuxt i18n from the beginning. The default locale is `zh-TW`; add additional
locales through locale files and i18n configuration rather than hardcoding text in
components or pages.

Keep the MVP focused on one property and one currency. Do not introduce Redis,
microservices, or multiple workspace packages unless the project scope is explicitly
changed.

## Repository structure

Use Nuxt's conventional root-level directories:

- `app/`: pages, components, composables, and client-side UI code
- `server/api/`: HTTP route handlers
- `server/services/`: reservation, inventory, and domain workflows
- `server/repositories/`: database access and queries
- `server/utils/`: server-only helpers
- `shared/types/`: types shared by client and server
- `shared/schemas/`: Zod schemas shared by client and server
- `locales/`: translation messages grouped by locale
- `db/`: schema, migrations, and database configuration if supported by the chosen ORM

API route handlers should only translate HTTP input/output. Business rules and
transactions belong in `server/services`; database queries belong in
`server/repositories`.

## Domain rules

- Guests reserve a `RoomType`, not a specific `Room`.
- Keep `Property`, `RoomType`, `Room`, `RoomInventory`, `Reservation`, and
  `ReservationItem` as separate domain concepts.
- Stay dates use the half-open interval `[checkInDate, checkOutDate)`.
- The number of nights is the date difference between checkout and check-in.
- `ReservationItem` must preserve historical snapshots such as room-type name,
  rate-plan name, nightly prices, taxes, and discounts.
- Reservation statuses are `PENDING_PAYMENT`, `CONFIRMED`, `CANCELLED`, and `EXPIRED`.
- Allowed transitions are:
  - `PENDING_PAYMENT -> CONFIRMED`
  - `PENDING_PAYMENT -> EXPIRED`
  - `PENDING_PAYMENT -> CANCELLED`
  - `CONFIRMED -> CANCELLED`

## Inventory and reservation consistency

The availability formula is:

```text
available = total_quantity - reserved_quantity - blocked_quantity
```

Creating a reservation hold must perform all of the following in one PostgreSQL
transaction:

1. Lock each relevant `room_inventory` row for the requested room type and date.
2. Check that every night's available quantity is sufficient.
3. Increment `reserved_quantity`.
4. Create the `PENDING_PAYMENT` reservation and its `expiresAt`.
5. Roll back every change if any step fails.

`room_inventory` must contain one row per room type and stay date before row locking
is used. Enforce uniqueness on `(room_type_id, stay_date)`.

Reservation creation must support `Idempotency-Key` so repeated client requests do
not create duplicate holds or reservations.

Expired holds must transition to `EXPIRED` and release their reserved inventory in a
safe, repeatable operation. Cancellation and expiration must not release inventory
more than once.

## API conventions

Use the response shape defined by the plan:

```ts
type ApiResponse<T> =
  | { success: true; data: T }
  | {
      success: false
      error: {
        code: string
        message: string
        details?: unknown
      }
    }
```

Validate external input with Zod. Keep error codes stable and avoid exposing raw
database errors to clients.

Keep API error codes language-neutral. User-facing error messages should be resolved
by the client through i18n keys, so changing locale does not require changing the API.

Use translation keys for all user-facing text, including labels, validation errors,
empty states, loading states, reservation statuses, and action buttons. Do not use
display text as a translation key. Keep locale files structurally aligned so a new
locale can be created by copying the existing message structure.

Prefer small service interfaces such as:

```ts
createReservationHold(input)
confirmReservation(input)
cancelReservation(input)
expireReservation(input)
```

## Implementation guidance

- Use TypeScript strictness and avoid `any` unless there is a documented boundary.
- Keep monetary calculations precise; do not use floating-point arithmetic for
  persisted amounts.
- Make date and timezone assumptions explicit in schemas, services, and tests.
- Format dates, numbers, currencies, and reservation status labels according to the
  active locale; do not concatenate localized strings manually.
- Keep database-specific code inside repositories and migrations.
- Do not add authentication, payment-provider, or admin complexity beyond the MVP
  requirements without documenting the scope change.
- Do not silently change domain terminology or reservation status semantics.

## Testing requirements

Every inventory or reservation change should include focused tests for:

- half-open date ranges and night counting
- availability calculation
- insufficient inventory
- concurrent reservation attempts and prevention of overselling
- idempotent reservation requests
- valid and invalid status transitions
- cancellation and expiration releasing inventory exactly once
- reservation-item historical price snapshots

Add Playwright coverage for the most important user-facing search-to-reservation
flow once the application UI exists.

## Decisions to record before implementation

Before adding persistence code, record the selected ORM, migration workflow, money
representation, date/time policy, authentication boundary, and payment behavior in
the project documentation or an architectural decision record.
