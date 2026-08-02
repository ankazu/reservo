import { and, eq, gte, lt, lte, sql } from 'drizzle-orm'
import type { NodePgTransaction } from 'drizzle-orm/node-postgres'

import * as schema from '../../db/schema'

export type Transaction = NodePgTransaction<typeof schema, typeof schema>

export async function findReservationByIdempotencyKey(
  tx: Transaction,
  propertyId: string,
  idempotencyKey: string,
) {
  const rows = await tx
    .select()
    .from(schema.reservations)
    .where(
      and(
        eq(schema.reservations.propertyId, propertyId),
        eq(schema.reservations.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1)

  return rows[0]
}

export async function findReservationById(
  tx: Transaction,
  reservationId: string,
) {
  const rows = await tx
    .select({
      id: schema.reservations.id,
      propertyId: schema.reservations.propertyId,
      status: schema.reservations.status,
      guestName: schema.reservations.guestName,
      guestEmail: schema.reservations.guestEmail,
      guestCount: schema.reservations.guestCount,
      checkInDate: schema.reservations.checkInDate,
      checkOutDate: schema.reservations.checkOutDate,
      subtotalAmount: schema.reservations.subtotalAmount,
      taxesAmount: schema.reservations.taxesAmount,
      discountsAmount: schema.reservations.discountsAmount,
      totalAmount: schema.reservations.totalAmount,
      expiresAt: schema.reservations.expiresAt,
    })
    .from(schema.reservations)
    .where(eq(schema.reservations.id, reservationId))
    .limit(1)

  return rows[0]
}

export async function lockInventoryForStay(
  tx: Transaction,
  roomTypeId: string,
  checkInDate: string,
  checkOutDate: string,
) {
  return tx
    .select()
    .from(schema.roomInventory)
    .where(
      and(
        eq(schema.roomInventory.roomTypeId, roomTypeId),
        gte(schema.roomInventory.stayDate, checkInDate),
        lt(schema.roomInventory.stayDate, checkOutDate),
      ),
    )
    .orderBy(schema.roomInventory.stayDate)
    .for('update')
}

export async function findInventoryForStay(
  tx: Transaction,
  roomTypeId: string,
  checkInDate: string,
  checkOutDate: string,
) {
  return tx
    .select()
    .from(schema.roomInventory)
    .where(
      and(
        eq(schema.roomInventory.roomTypeId, roomTypeId),
        gte(schema.roomInventory.stayDate, checkInDate),
        lt(schema.roomInventory.stayDate, checkOutDate),
      ),
    )
    .orderBy(schema.roomInventory.stayDate)
}

export async function provisionInventoryForStay(
  tx: Transaction,
  roomTypeId: string,
  stayDates: string[],
) {
  if (stayDates.length === 0) return

  const rooms = await tx
    .select({ id: schema.rooms.id })
    .from(schema.rooms)
    .where(eq(schema.rooms.roomTypeId, roomTypeId))

  if (rooms.length === 0) return

  await tx
    .insert(schema.roomInventory)
    .values(
      stayDates.map((stayDate) => ({
        roomTypeId,
        stayDate,
        totalQuantity: rooms.length,
      })),
    )
    .onConflictDoNothing({
      target: [schema.roomInventory.roomTypeId, schema.roomInventory.stayDate],
    })
}

export async function findRoomType(tx: Transaction, roomTypeId: string) {
  const rows = await tx
    .select()
    .from(schema.roomTypes)
    .where(eq(schema.roomTypes.id, roomTypeId))
    .limit(1)

  return rows[0]
}

export async function lockReservation(tx: Transaction, reservationId: string) {
  const rows = await tx
    .select()
    .from(schema.reservations)
    .where(eq(schema.reservations.id, reservationId))
    .for('update')
    .limit(1)

  return rows[0]
}

export async function lockExpiredReservations(
  tx: Transaction,
  now: Date,
  limit: number,
) {
  return tx
    .select({ id: schema.reservations.id })
    .from(schema.reservations)
    .where(
      and(
        eq(schema.reservations.status, 'PENDING_PAYMENT'),
        lte(schema.reservations.expiresAt, now),
      ),
    )
    .orderBy(schema.reservations.expiresAt)
    .limit(limit)
    .for('update', { skipLocked: true })
}

export async function findReservationItems(
  tx: Transaction,
  reservationId: string,
) {
  return tx
    .select()
    .from(schema.reservationItems)
    .where(eq(schema.reservationItems.reservationId, reservationId))
}

export async function reserveInventory(
  tx: Transaction,
  inventoryId: string,
  quantity: number,
) {
  await tx
    .update(schema.roomInventory)
    .set({
      reservedQuantity: sql`${schema.roomInventory.reservedQuantity} + ${quantity}`,
    })
    .where(eq(schema.roomInventory.id, inventoryId))
}

export async function releaseInventory(
  tx: Transaction,
  inventoryId: string,
  quantity: number,
) {
  const rows = await tx
    .update(schema.roomInventory)
    .set({
      reservedQuantity: sql`${schema.roomInventory.reservedQuantity} - ${quantity}`,
    })
    .where(
      and(
        eq(schema.roomInventory.id, inventoryId),
        gte(schema.roomInventory.reservedQuantity, quantity),
      ),
    )

    .returning({ id: schema.roomInventory.id })

  return rows.length === 1
}

export async function updateReservationStatus(
  tx: Transaction,
  reservationId: string,
  status: (typeof schema.reservationStatus.enumValues)[number],
) {
  const rows = await tx
    .update(schema.reservations)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.reservations.id, reservationId))
    .returning()

  return rows[0]
}

export async function createReservation(
  tx: Transaction,
  values: typeof schema.reservations.$inferInsert,
) {
  const rows = await tx.insert(schema.reservations).values(values).returning()
  return rows[0]
}

export async function createReservationItem(
  tx: Transaction,
  values: typeof schema.reservationItems.$inferInsert,
) {
  const rows = await tx
    .insert(schema.reservationItems)
    .values(values)
    .returning()
  return rows[0]
}
