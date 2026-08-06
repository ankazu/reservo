import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../../db/schema'
import { getReservationRequestFingerprint } from '../../../shared/utils/reservation-request'
import { createReservationHold } from '../../../server/services/reservation/create-hold'
import { getAvailability } from '../../../server/services/reservation/availability'
import { db } from '../../../server/utils/db'

const runIntegration = Boolean(process.env.DATABASE_URL)
const describeIntegration = process.env.REQUIRE_DATABASE
  ? describe
  : describe.skipIf(!runIntegration)

describeIntegration('reservation idempotency PostgreSQL integration', () => {
  const database = db!
  const propertyId = crypto.randomUUID()
  const roomTypeId = crypto.randomUUID()
  const inventoryId = crypto.randomUUID()
  const roomId = crypto.randomUUID()
  const reservationIds: string[] = []
  const checkInDate = '2099-01-01'
  const checkOutDate = '2099-01-03'

  const input = {
    propertyId,
    roomTypeId,
    checkInDate,
    checkOutDate,
    quantity: 1,
    guests: 2,
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
      code: `idempotency-${roomTypeId}`,
      propertyId,
      name: 'Idempotency Test Room',
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
      .delete(schema.rooms)
      .where(eq(schema.rooms.roomTypeId, roomTypeId))
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
      .set({ reservedQuantity: 0, blockedQuantity: 0, totalQuantity: 1 })
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

  it('returns the access token once and persists only its hash', async () => {
    const key = `integration-access-${crypto.randomUUID()}`
    const fingerprint = getReservationRequestFingerprint(input)

    const created = await createReservationHold(
      database,
      input,
      key,
      fingerprint,
    )
    const replayed = await createReservationHold(
      database,
      input,
      key,
      fingerprint,
    )
    reservationIds.push(created.id)

    expect(created.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(created.accessUrl).toContain(`#reservationId=${created.id}`)
    expect(replayed).not.toHaveProperty('accessToken')
    expect(replayed).not.toHaveProperty('accessUrl')

    const rows = await database
      .select({ accessTokenHash: schema.reservations.accessTokenHash })
      .from(schema.reservations)
      .where(eq(schema.reservations.id, created.id))
    expect(rows[0]?.accessTokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(rows[0]?.accessTokenHash).not.toBe(created.accessToken)
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

  it('rolls back provisioned inventory when the hold cannot be created', async () => {
    const futureCheckIn = '2099-02-01'
    const futureCheckOut = '2099-02-03'
    const futureInput = {
      ...input,
      checkInDate: futureCheckIn,
      checkOutDate: futureCheckOut,
      quantity: 2,
    }
    const before = await database
      .select()
      .from(schema.roomInventory)
      .where(eq(schema.roomInventory.roomTypeId, roomTypeId))
    expect(before.some((row) => row.stayDate === futureCheckIn)).toBe(false)

    await expect(
      createReservationHold(
        database,
        futureInput,
        `integration-rollback-${crypto.randomUUID()}`,
        getReservationRequestFingerprint(futureInput),
      ),
    ).rejects.toThrow('INSUFFICIENT_INVENTORY')

    const after = await database
      .select()
      .from(schema.roomInventory)
      .where(eq(schema.roomInventory.roomTypeId, roomTypeId))
    expect(after.some((row) => row.stayDate === futureCheckIn)).toBe(false)
  })

  it('provisions missing dates once for concurrent requests with the same key', async () => {
    const futureInput = {
      ...input,
      checkInDate: '2099-03-01',
      checkOutDate: '2099-03-03',
    }
    const key = `integration-provision-${crypto.randomUUID()}`
    const fingerprint = getReservationRequestFingerprint(futureInput)
    const results = await Promise.all([
      createReservationHold(database, futureInput, key, fingerprint),
      createReservationHold(database, futureInput, key, fingerprint),
    ])

    reservationIds.push(results[0].id)
    expect(results[1].id).toBe(results[0].id)
    const inventory = await database
      .select()
      .from(schema.roomInventory)
      .where(eq(schema.roomInventory.roomTypeId, roomTypeId))
    expect(
      inventory.filter((row) =>
        ['2099-03-01', '2099-03-02'].includes(row.stayDate),
      ),
    ).toHaveLength(2)
  })

  it('syncs unoccupied inventory after rooms change and preserves occupied rows', async () => {
    const secondRoomId = crypto.randomUUID()
    const stayDates = [checkInDate, '2099-01-02']
    await database.insert(schema.rooms).values({
      id: secondRoomId,
      roomTypeId,
      name: 'Room 2',
    })

    await getAvailability(database, input)
    let inventory = await database
      .select()
      .from(schema.roomInventory)
      .where(
        and(
          eq(schema.roomInventory.roomTypeId, roomTypeId),
          inArray(schema.roomInventory.stayDate, stayDates),
        ),
      )
    expect(inventory.every((row) => row.totalQuantity === 2)).toBe(true)

    await database
      .update(schema.roomInventory)
      .set({ blockedQuantity: 1 })
      .where(eq(schema.roomInventory.id, inventoryId))
    await database.delete(schema.rooms).where(eq(schema.rooms.id, secondRoomId))

    await getAvailability(database, input)
    inventory = await database
      .select()
      .from(schema.roomInventory)
      .where(
        and(
          eq(schema.roomInventory.roomTypeId, roomTypeId),
          inArray(schema.roomInventory.stayDate, stayDates),
        ),
      )
    expect(inventory.find((row) => row.id === inventoryId)?.totalQuantity).toBe(
      2,
    )
    expect(inventory.find((row) => row.id !== inventoryId)?.totalQuantity).toBe(
      1,
    )
  })
})
