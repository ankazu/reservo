import { verifyDatabaseConnection } from '../repositories/health'
import type { db } from '../utils/db'

type Database = NonNullable<typeof db>

export async function checkApplicationHealth(database: Database) {
  await verifyDatabaseConnection(database)
}
