import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../../db/schema'
import { getReservationRequestFingerprint } from '../../../shared/utils/reservation-request'
import { createReservationHold } from '../../../server/services/reservation/create-hold'
import { db } from '../../../server/utils/db'

const runIntegration = Boolean(process.env.DATABASE_URL)
const describeIntegration = describe.skipIf(!runIntegration)

describeIntegration('reservation idempotency PostgreSQL integration', () => {
  const database = db!
  const propertyId = crypto.randomUUID()
  const roomTypeId = crypto.randomUUID()
  const inventoryId = crypto.randomUUID()
  const reservationIds: string[] = []
  const checkInDate = '2099-01-01'
  const checkOutDate = '2099-01-03'

  const input = {
    propertyId,
    roomTypeId,
    checkInDate,
    checkOutDate,
    quantity: 1,
    guestName: 'Integration Guest',
    guestEmail: 'integration@example.com',
    ratePlanName: 'Standard' as const,
  }

  beforeAll(async () => {
    await database.insert(schema.properties).values({
      id: propertyId,
      name: 'Idempotency Test Property',
      timezone: 'Asia/Taipei',
      currency: 'TWD',
    })
    await database.insert(schema.roomTypes).values({
      id: roomTypeId,
      propertyId,
      name: 'Idempotency Test Room',
      description: 'Test room',
      maxGuests: 2,
      nightlyPrice: 1,
    })
    await database.insert(schema.roomInventory).values([
      {
        id: inventoryId,
        roomTypeId,
        stayDate: checkInDate,
        totalQuantity: 1,
      },
      {
        id: crypto.randomUUID(),
        roomTypeId,
        stayDate: '2099-01-02',
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
      .delete(schema.roomTypes)
      .where(eq(schema.roomTypes.id, roomTypeId))
    await database
      .delete(schema.properties)
      .where(eq(schema.properties.id, propertyId))
  })

  afterEach(async () => {
    if (reservationIds.length > 0) {
      await database
        .delete(schema.reservationItems)
        .where(inArray(schema.reservationItems.reservationId, reservationIds))
      await database
        .delete(schema.reservations)
        .where(inArray(schema.reservations.id, reservationIds))
      reservationIds.length = 0
    }
    await database
      .update(schema.roomInventory)
      .set({ reservedQuantity: 0 })
      .where(eq(schema.roomInventory.roomTypeId, roomTypeId))
  })

  it('returns one reservation for concurrent requests with the same key', async () => {
    const key = `integration-same-${crypto.randomUUID()}`
    const fingerprint = getReservationRequestFingerprint(input)
    const results = await Promise.all([
      createReservationHold(database, input, key, fingerprint),
      createReservationHold(database, input, key, fingerprint),
    ])

    reservationIds.push(results[0].id)
    expect(results[1].id).toBe(results[0].id)
    const inventory = await database
      .select()
      .from(schema.roomInventory)
      .where(eq(schema.roomInventory.roomTypeId, roomTypeId))
    expect(inventory.every((row) => row.reservedQuantity === 1)).toBe(true)
  })

  it('prevents overselling with concurrent different keys', async () => {
    const results = await Promise.allSettled([
      createReservationHold(
        database,
        input,
        `integration-a-${crypto.randomUUID()}`,
        getReservationRequestFingerprint(input),
      ),
      createReservationHold(
        database,
        input,
        `integration-b-${crypto.randomUUID()}`,
        getReservationRequestFingerprint(input),
      ),
    ])

    const successful = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof createReservationHold>>
      > => result.status === 'fulfilled',
    )
    const rejected = results.filter((result) => result.status === 'rejected')
    reservationIds.push(...successful.map((result) => result.value.id))
    expect(successful).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0].reason as Error).message).toBe('INSUFFICIENT_INVENTORY')
  })
})
