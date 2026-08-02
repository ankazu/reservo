import { readFileSync } from 'node:fs'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../../db/schema'
import { db } from '../../../server/utils/db'

const runIntegration = Boolean(process.env.DATABASE_URL)
const describeIntegration = describe.skipIf(!runIntegration)

describeIntegration('cancellation policy corrective migration', () => {
  const database = db!
  const propertyId = crypto.randomUUID()
  const reservationId = crypto.randomUUID()
  const customizedReservationId = crypto.randomUUID()
  const distinctCustomizedReservationId = crypto.randomUUID()
  const changedTimezonePropertyId = crypto.randomUUID()
  const changedTimezoneReservationId = crypto.randomUUID()
  const nullableReservationId = crypto.randomUUID()
  const invalidTimezonePropertyId = crypto.randomUUID()
  const invalidTimezoneReservationId = crypto.randomUUID()
  const migrationSql = readFileSync(
    new URL(
      '../../../db/migrations/0009_normalize_cancellation_timezone.sql',
      import.meta.url,
    ),
    'utf8',
  )

  async function insertReservation(input: {
    id: string
    propertyId: string
    guestName: string
    guestEmail: string
    cancellableUntil: Date
  }) {
    await database.insert(schema.reservations).values({
      ...input,
      guestCount: 1,
      checkInDate: '2099-04-01',
      checkOutDate: '2099-04-02',
      subtotalAmount: 100,
      totalAmount: 100,
      idempotencyKey: `migration-${input.id}`,
    })
  }

  beforeAll(async () => {
    await database.insert(schema.properties).values({
      id: propertyId,
      name: 'Migration Test Property',
      timezone: 'America/New_York',
      currency: 'TWD',
    })
    await insertReservation({
      id: reservationId,
      propertyId,
      guestName: 'Migration Guest',
      guestEmail: 'migration@example.com',
      cancellableUntil: new Date('2099-04-01T04:00:00.000Z'),
    })
    await insertReservation({
      id: customizedReservationId,
      propertyId,
      guestName: 'Customized Migration Guest',
      guestEmail: 'customized-migration@example.com',
      cancellableUntil: new Date('2099-04-01T04:00:00.000Z'),
    })
    await insertReservation({
      id: distinctCustomizedReservationId,
      propertyId,
      guestName: 'Distinct Customized Migration Guest',
      guestEmail: 'distinct-customized-migration@example.com',
      cancellableUntil: new Date('2099-04-01T12:00:00.000Z'),
    })
    await database.insert(schema.properties).values({
      id: changedTimezonePropertyId,
      name: 'Changed Timezone Property',
      timezone: 'America/New_York',
      currency: 'TWD',
    })
    await insertReservation({
      id: changedTimezoneReservationId,
      propertyId: changedTimezonePropertyId,
      guestName: 'Changed Timezone Guest',
      guestEmail: 'changed-timezone@example.com',
      cancellableUntil: new Date('2099-04-01T04:00:00.000Z'),
    })
    await database
      .update(schema.properties)
      .set({ timezone: 'Asia/Tokyo' })
      .where(eq(schema.properties.id, changedTimezonePropertyId))
    await insertReservation({
      id: nullableReservationId,
      propertyId,
      guestName: 'Nullable Migration Guest',
      guestEmail: 'nullable-migration@example.com',
      cancellableUntil: new Date('2099-04-01T04:00:00.000Z'),
    })
    await database.insert(schema.properties).values({
      id: invalidTimezonePropertyId,
      name: 'Invalid Timezone Property',
      timezone: 'Invalid/Timezone',
      currency: 'TWD',
    })
    await insertReservation({
      id: invalidTimezoneReservationId,
      propertyId: invalidTimezonePropertyId,
      guestName: 'Invalid Timezone Guest',
      guestEmail: 'invalid-timezone@example.com',
      cancellableUntil: new Date('2099-04-01T04:00:00.000Z'),
    })
  })

  afterAll(async () => {
    await database
      .delete(schema.reservations)
      .where(eq(schema.reservations.propertyId, propertyId))
    await database
      .delete(schema.properties)
      .where(eq(schema.properties.id, propertyId))
    await database
      .delete(schema.reservations)
      .where(eq(schema.reservations.propertyId, changedTimezonePropertyId))
    await database
      .delete(schema.properties)
      .where(eq(schema.properties.id, changedTimezonePropertyId))
    await database
      .delete(schema.reservations)
      .where(eq(schema.reservations.propertyId, invalidTimezonePropertyId))
    await database
      .delete(schema.properties)
      .where(eq(schema.properties.id, invalidTimezonePropertyId))
  })

  it('normalizes identifiable legacy rows and preserves changed-timezone rows', async () => {
    await database.transaction(async (tx) => {
      async function findCancellableUntil(id: string) {
        const [reservation] = await tx
          .select({ cancellableUntil: schema.reservations.cancellableUntil })
          .from(schema.reservations)
          .where(eq(schema.reservations.id, id))

        return reservation.cancellableUntil
      }

      await tx.execute(
        sql.raw(
          'ALTER TABLE "reservations" ALTER COLUMN "cancellable_until" DROP NOT NULL',
        ),
      )
      await tx.execute(
        sql.raw(
          `UPDATE "reservations" SET "cancellable_until" = NULL WHERE "id" = '${nullableReservationId}'`,
        ),
      )
      await tx.execute(sql.raw(migrationSql))

      expect(await findCancellableUntil(reservationId)).toEqual(
        new Date('2099-03-31T16:00:00.000Z'),
      )

      // A custom deadline equal to the legacy value is indistinguishable
      // without provenance, so the migration necessarily normalizes it too.
      expect(await findCancellableUntil(customizedReservationId)).toEqual(
        new Date('2099-03-31T16:00:00.000Z'),
      )

      expect(
        await findCancellableUntil(distinctCustomizedReservationId),
      ).toEqual(new Date('2099-04-01T12:00:00.000Z'))

      expect(await findCancellableUntil(changedTimezoneReservationId)).toEqual(
        new Date('2099-04-01T04:00:00.000Z'),
      )

      expect(await findCancellableUntil(nullableReservationId)).toEqual(
        new Date('2099-03-31T16:00:00.000Z'),
      )

      expect(await findCancellableUntil(invalidTimezoneReservationId)).toEqual(
        new Date('2099-04-01T04:00:00.000Z'),
      )
    })
  })
})
