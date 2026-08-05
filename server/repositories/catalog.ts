import { asc, eq } from 'drizzle-orm'

import * as schema from '../../db/schema'
import type { Transaction } from './reservation'

export async function findConfiguredProperty(tx: Transaction) {
  const rows = await tx
    .select({
      id: schema.properties.id,
      name: schema.properties.name,
      timezone: schema.properties.timezone,
      currency: schema.properties.currency,
    })
    .from(schema.properties)
    .orderBy(asc(schema.properties.createdAt), asc(schema.properties.id))
    .limit(1)

  return rows[0] ?? null
}

export async function findRoomTypeCatalog(tx: Transaction, propertyId: string) {
  return tx
    .select({
      id: schema.roomTypes.id,
      code: schema.roomTypes.code,
      propertyId: schema.roomTypes.propertyId,
      name: schema.roomTypes.name,
      description: schema.roomTypes.description,
      maxGuests: schema.roomTypes.maxGuests,
      nightlyPrice: schema.roomTypes.nightlyPrice,
    })
    .from(schema.roomTypes)
    .where(eq(schema.roomTypes.propertyId, propertyId))
    .orderBy(asc(schema.roomTypes.createdAt), asc(schema.roomTypes.id))
}
