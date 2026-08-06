import { sql } from 'drizzle-orm'

import type { db } from '../utils/db'

type Database = NonNullable<typeof db>

export async function verifyDatabaseConnection(database: Database) {
  await database.execute(sql`select 1`)
}
