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
  const migration = readFileSync(
    new URL(
      '../../../db/migrations/0009_normalize_cancellation_timezone.sql',
      import.meta.url,
    ),
    'utf8',
  )

  beforeAll(async () => {
    await database.insert(schema.properties).values({
      id: propertyId,
      name: 'Migration Test Property',
      timezone: 'America/New_York',
      currency: 'TWD',
    })
    await database.insert(schema.reservations).values({
      id: reservationId,
      propertyId,
      guestName: 'Migration Guest',
      guestEmail: 'migration@example.com',
      guestCount: 1,
      checkInDate: '2099-04-01',
      checkOutDate: '2099-04-02',
      subtotalAmount: 100,
      totalAmount: 100,
      cancellableUntil: new Date('2099-04-01T04:00:00.000Z'),
      idempotencyKey: `migration-${reservationId}`,
    })
  })

  afterAll(async () => {
    await database
      .delete(schema.reservations)
      .where(eq(schema.reservations.id, reservationId))
    await database
      .delete(schema.properties)
      .where(eq(schema.properties.id, propertyId))
  })

  it('replaces a property-timezone deadline with fixed Asia/Taipei midnight', async () => {
    await database.execute(sql.raw(migration))

    const [reservation] = await database
      .select({ cancellableUntil: schema.reservations.cancellableUntil })
      .from(schema.reservations)
      .where(eq(schema.reservations.id, reservationId))

    expect(reservation.cancellableUntil).toEqual(
      new Date('2099-03-31T16:00:00.000Z'),
    )
  })
})
