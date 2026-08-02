import {
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const reservationStatus = pgEnum('reservation_status', [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
])

export const properties = pgTable('properties', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Asia/Taipei'),
  currency: text('currency').notNull().default('TWD'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const roomTypes = pgTable('room_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  maxGuests: integer('max_guests').notNull(),
  nightlyPrice: integer('nightly_price').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const rooms = pgTable('rooms', {
  id: uuid('id').defaultRandom().primaryKey(),
  roomTypeId: uuid('room_type_id')
    .notNull()
    .references(() => roomTypes.id),
  name: text('name').notNull(),
})

export const roomInventory = pgTable(
  'room_inventory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => roomTypes.id),
    stayDate: date('stay_date').notNull(),
    totalQuantity: integer('total_quantity').notNull(),
    reservedQuantity: integer('reserved_quantity').notNull().default(0),
    blockedQuantity: integer('blocked_quantity').notNull().default(0),
  },
  (table) => [
    unique('room_inventory_room_type_date').on(
      table.roomTypeId,
      table.stayDate,
    ),
  ],
)

export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id),
    status: reservationStatus('status').notNull().default('PENDING_PAYMENT'),
    guestName: text('guest_name').notNull(),
    guestEmail: text('guest_email').notNull(),
    checkInDate: date('check_in_date').notNull(),
    checkOutDate: date('check_out_date').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('reservations_property_idempotency_key').on(
      table.propertyId,
      table.idempotencyKey,
    ),
  ],
)

export const reservationItems = pgTable('reservation_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  reservationId: uuid('reservation_id')
    .notNull()
    .references(() => reservations.id),
  roomTypeId: uuid('room_type_id')
    .notNull()
    .references(() => roomTypes.id),
  roomTypeNameSnapshot: text('room_type_name_snapshot').notNull(),
  ratePlanNameSnapshot: text('rate_plan_name_snapshot').notNull(),
  nightlyPrice: integer('nightly_price').notNull(),
  taxes: integer('taxes').notNull().default(0),
  discounts: integer('discounts').notNull().default(0),
  quantity: integer('quantity').notNull(),
})
