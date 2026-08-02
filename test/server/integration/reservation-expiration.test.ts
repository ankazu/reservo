import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../../db/schema'
import { getReservationRequestFingerprint } from '../../../shared/utils/reservation-request'
import { createReservationHold } from '../../../server/services/reservation/create-hold'
import {
  expireReservations,
  transitionReservation,
} from '../../../server/services/reservation/transition'
import { db } from '../../../server/utils/db'

const runIntegration = Boolean(process.env.DATABASE_URL)
const describeIntegration = describe.skipIf(!runIntegration)

describeIntegration('reservation expiration PostgreSQL integration', () => {
  const database = db!
  const propertyId = crypto.randomUUID()
  const roomTypeId = crypto.randomUUID()
  const roomId = crypto.randomUUID()
  const reservationIds: string[] = []
  const checkInDate = '2099-04-01'
  const checkOutDate = '2099-04-03'

  const input = {
    propertyId,
    roomTypeId,
    checkInDate,
    checkOutDate,
    quantity: 1,
    guests: 2,
    guestName: 'Expiration Guest',
    guestEmail: 'expiration@example.com',
    ratePlanName: 'Standard' as const,
  }

  beforeAll(async () => {
    await database.insert(schema.properties).values({
      id: propertyId,
      name: 'Expiration Test Property',
      timezone: 'Asia/Taipei',
      currency: 'TWD',
    })
    await database.insert(schema.roomTypes).values({
      id: roomTypeId,
      propertyId,
      name: 'Expiration Test Room',
      description: 'Test room',
      maxGuests: 2,
      nightlyPrice: 1,
    })
    await database.insert(schema.rooms).values({
      id: roomId,
      roomTypeId,
      name: 'Room 1',
    })
    await database.insert(schema.roomInventory).values([
      { roomTypeId, stayDate: checkInDate, totalQuantity: 1 },
      {
        roomTypeId,
        stayDate: checkOutDate.replace('-03', '-02'),
        totalQuantity: 1,
      },
    ])
  })

  afterAll(async () => {
    if (reservationIds.length > 0) {
      await database
        .delete(schema.reservationItems)
        .where(inArray(schema.reservationItems.reservationId, reservationIds))
      await database
        .delete(schema.reservations)
        .where(inArray(schema.reservations.id, reservationIds))
    }
    await database
      .delete(schema.roomInventory)
      .where(eq(schema.roomInventory.roomTypeId, roomTypeId))
    await database
      .delete(schema.rooms)
      .where(eq(schema.rooms.roomTypeId, roomTypeId))
    await database
      .delete(schema.roomTypes)
      .where(eq(schema.roomTypes.id, roomTypeId))
    await database
      .delete(schema.properties)
      .where(eq(schema.properties.id, propertyId))
  })

  it('releases inventory exactly once when expiration runs concurrently', async () => {
    const reservation = await createReservationHold(
      database,
      input,
      `integration-expire-${crypto.randomUUID()}`,
      getReservationRequestFingerprint(input),
    )
    reservationIds.push(reservation.id)

    expect(reservation).toMatchObject({
      guestCount: input.guests,
      subtotalAmount: 2,
      taxesAmount: 0,
      discountsAmount: 0,
      totalAmount: 2,
    })
    const [storedReservation] = await database
      .select()
      .from(schema.reservations)
      .where(eq(schema.reservations.id, reservation.id))
    expect(storedReservation).toMatchObject({
      guestCount: input.guests,
      subtotalAmount: 2,
      taxesAmount: 0,
      discountsAmount: 0,
      totalAmount: 2,
      cancellableUntil: null,
    })
    await database
      .update(schema.reservations)
      .set({ expiresAt: new Date('2099-01-01T00:00:00Z') })
      .where(eq(schema.reservations.id, reservation.id))

    const results = await Promise.all([
      expireReservations(database, {
        now: new Date('2099-01-02T00:00:00Z'),
      }),
      expireReservations(database, {
        now: new Date('2099-01-02T00:00:00Z'),
      }),
    ])

    expect(
      results.flat().filter((item) => item.id === reservation.id),
    ).toHaveLength(1)
    const [updated] = await database
      .select()
      .from(schema.reservations)
      .where(eq(schema.reservations.id, reservation.id))
    expect(updated.status).toBe('EXPIRED')

    const inventory = await database
      .select()
      .from(schema.roomInventory)
      .where(
        and(
          eq(schema.roomInventory.roomTypeId, roomTypeId),
          inArray(schema.roomInventory.stayDate, [checkInDate, '2099-04-02']),
        ),
      )
    expect(inventory.every((row) => row.reservedQuantity === 0)).toBe(true)

    const rerun = await expireReservations(database, {
      now: new Date('2099-01-03T00:00:00Z'),
    })
    expect(rerun).toHaveLength(0)
  })

  it('releases inventory exactly once when a hold is cancelled', async () => {
    const reservation = await createReservationHold(
      database,
      input,
      `integration-cancel-${crypto.randomUUID()}`,
      getReservationRequestFingerprint(input),
    )
    reservationIds.push(reservation.id)

    const cancelled = await transitionReservation(
      database,
      reservation.id,
      'CANCELLED',
    )
    const repeated = await transitionReservation(
      database,
      reservation.id,
      'CANCELLED',
    )

    expect(cancelled.status).toBe('CANCELLED')
    expect(repeated.status).toBe('CANCELLED')

    const inventory = await database
      .select()
      .from(schema.roomInventory)
      .where(
        and(
          eq(schema.roomInventory.roomTypeId, roomTypeId),
          inArray(schema.roomInventory.stayDate, [checkInDate, '2099-04-02']),
        ),
      )
    expect(inventory.every((row) => row.reservedQuantity === 0)).toBe(true)
  })

  it('keeps historical item pricing and names after room type changes', async () => {
    const reservation = await createReservationHold(
      database,
      input,
      `integration-snapshot-${crypto.randomUUID()}`,
      getReservationRequestFingerprint(input),
    )
    reservationIds.push(reservation.id)

    await database
      .update(schema.roomTypes)
      .set({ name: 'Renamed Test Room', nightlyPrice: 9999 })
      .where(eq(schema.roomTypes.id, roomTypeId))

    const [item] = await database
      .select()
      .from(schema.reservationItems)
      .where(eq(schema.reservationItems.reservationId, reservation.id))

    expect(item).toMatchObject({
      roomTypeNameSnapshot: 'Expiration Test Room',
      ratePlanNameSnapshot: 'Standard',
      nightlyPrice: 1,
      taxes: 0,
      discounts: 0,
      quantity: 1,
    })
    await transitionReservation(database, reservation.id, 'CANCELLED')
  })

  it('supports cancellation for a confirmed reservation', async () => {
    const reservation = await createReservationHold(
      database,
      input,
      `integration-confirmed-cancel-${crypto.randomUUID()}`,
      getReservationRequestFingerprint(input),
    )
    reservationIds.push(reservation.id)

    const confirmed = await transitionReservation(
      database,
      reservation.id,
      'CONFIRMED',
    )
    const cancelled = await transitionReservation(
      database,
      reservation.id,
      'CANCELLED',
    )

    expect(confirmed.status).toBe('CONFIRMED')
    expect(cancelled.status).toBe('CANCELLED')
  })
})
