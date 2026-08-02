import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from '../../db/schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString && process.env.NODE_ENV !== 'test') {
  console.warn(
    'DATABASE_URL is not configured; database routes will be unavailable.',
  )
}

const pool = connectionString ? new Pool({ connectionString }) : undefined

export const db = pool ? drizzle(pool, { schema }) : undefined
