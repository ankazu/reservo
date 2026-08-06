import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../../db/schema'
import { getReservationRequestFingerprint } from '../../../shared/utils/reservation-request'
import {
  inspectDailyInventory,
  setBlockedInventory,
} from '../../../server/services/inventory-operations'
import { createReservationHold } from '../../../server/services/reservation/create-hold'
import { db } from '../../../server/utils/db'

const runIntegration = Boolean(process.env.DATABASE_URL)
const describeIntegration = process.env.REQUIRE_DATABASE
  ? describe
  : describe.skipIf(!runIntegration)

describeIntegration('inventory operations PostgreSQL integration', () => {
  const database = db!
  const propertyId = crypto.randomUUID()
  const roomTypeId = crypto.randomUUID()
  const roomIds = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ]
  const reservationIds: string[] = []
  const stayDates = ['2099-08-10', '2099-08-11']

  beforeAll(async () => {
    await database.insert(schema.properties).values({
      id: propertyId,
      name: 'Inventory Operations Property',
      timezone: 'Asia/Taipei',
      currency: 'TWD',
    })
    await database.insert(schema.roomTypes).values({
      id: roomTypeId,
      code: `inventory-operations-${roomTypeId}`,
      propertyId,
      name: 'Inventory Operations Room',
      description: 'Test room',
      maxGuests: 6,
      nightlyPrice: 1000,
    })
    await database.insert(schema.rooms).values(
      roomIds.map((id, index) => ({
        id,
        roomTypeId,
        name: `Room ${index + 1}`,
      })),
    )
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

  it('blocks, verifies, and unblocks inventory without direct table edits', async () => {
    const blockInput = {
      roomTypeId,
      stayDate: stayDates[0],
      blockedQuantity: 2,
    }
    await expect(
      setBlockedInventory(database, blockInput),
    ).resolves.toMatchObject({
      totalQuantity: 3,
      reservedQuantity: 0,
      blockedQuantity: 2,
      availableQuantity: 1,
    })
    await expect(
      setBlockedInventory(database, blockInput),
    ).resolves.toMatchObject({
      totalQuantity: 3,
      reservedQuantity: 0,
      blockedQuantity: 2,
      availableQuantity: 1,
    })

    await expect(
      inspectDailyInventory(database, {
        roomTypeId,
        checkInDate: stayDates[0],
        checkOutDate: stayDates[1],
      }),
    ).resolves.toEqual([
      {
        stayDate: stayDates[0],
        totalQuantity: 3,
        reservedQuantity: 0,
        blockedQuantity: 2,
        availableQuantity: 1,
      },
    ])

    await expect(
      setBlockedInventory(database, {
        roomTypeId,
        stayDate: stayDates[0],
        blockedQuantity: 0,
      }),
    ).resolves.toMatchObject({
      blockedQuantity: 0,
      availableQuantity: 3,
    })
  })

  it('serializes blocking against holds so combined occupancy cannot exceed total', async () => {
    const holdInput = {
      propertyId,
      roomTypeId,
      checkInDate: stayDates[0],
      checkOutDate: stayDates[1],
      quantity: 2,
      guests: 2,
      guestName: 'Concurrent Inventory Guest',
      guestEmail: 'inventory-concurrency@example.com',
      ratePlanName: 'Standard' as const,
    }
    const results = await Promise.allSettled([
      setBlockedInventory(database, {
        roomTypeId,
        stayDate: stayDates[0],
        blockedQuantity: 2,
      }),
      createReservationHold(
        database,
        holdInput,
        `inventory-operation-${crypto.randomUUID()}`,
        getReservationRequestFingerprint(holdInput),
      ),
    ])
    const created = results[1]
    if (created.status === 'fulfilled') reservationIds.push(created.value.id)

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const [row] = await database
      .select()
      .from(schema.roomInventory)
      .where(eq(schema.roomInventory.roomTypeId, roomTypeId))
    expect(row.reservedQuantity + row.blockedQuantity).toBeLessThanOrEqual(
      row.totalQuantity,
    )
  })
})
