import {
  findConfiguredProperty,
  findRoomTypeCatalog,
} from '../repositories/catalog'
import type { db } from '../utils/db'

type Database = NonNullable<typeof db>

export function getPropertyCatalog(database: Database) {
  return database.transaction((tx) => findConfiguredProperty(tx))
}

export function getConfiguredRoomTypeCatalog(database: Database) {
  return database.transaction(async (tx) => {
    const property = await findConfiguredProperty(tx)
    if (!property) return null
    return findRoomTypeCatalog(tx, property.id)
  })
}
