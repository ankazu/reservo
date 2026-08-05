import { defineEventHandler, setResponseStatus } from 'h3'

import type { ApiResponse } from '../../shared/types/api'
import type { PropertyCatalog } from '../../shared/types/catalog'
import { getPropertyCatalog } from '../services/catalog'
import { db } from '../utils/db'

export default defineEventHandler(
  async (event): Promise<ApiResponse<PropertyCatalog>> => {
    if (!db) {
      setResponseStatus(event, 503)
      return {
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'DATABASE_UNAVAILABLE',
        },
      }
    }

    try {
      const property = await getPropertyCatalog(db)
      if (!property) {
        setResponseStatus(event, 404)
        return {
          success: false,
          error: { code: 'PROPERTY_NOT_FOUND', message: 'PROPERTY_NOT_FOUND' },
        }
      }
      return { success: true, data: property }
    } catch {
      setResponseStatus(event, 500)
      return {
        success: false,
        error: { code: 'CATALOG_FAILED', message: 'CATALOG_FAILED' },
      }
    }
  },
)
