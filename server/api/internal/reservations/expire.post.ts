import { defineEventHandler, getHeader, setResponseStatus } from 'h3'

import type { ApiResponse } from '../../../../shared/types/api'
import { expireReservations } from '../../../services/reservation/transition'
import { isMaintenanceSecretValid } from '../../../utils/maintenance-auth'
import { db } from '../../../utils/db'

export default defineEventHandler(
  async (event): Promise<ApiResponse<{ expiredCount: number }>> => {
    if (
      !isMaintenanceSecretValid(
        getHeader(event, 'x-maintenance-secret'),
        process.env.RESERVATION_MAINTENANCE_SECRET,
      )
    ) {
      setResponseStatus(event, 401)
      return {
        success: false,
        error: {
          code: 'MAINTENANCE_UNAUTHORIZED',
          message: 'MAINTENANCE_UNAUTHORIZED',
        },
      }
    }

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
      const expired = await expireReservations(db)
      return { success: true, data: { expiredCount: expired.length } }
    } catch {
      setResponseStatus(event, 500)
      return {
        success: false,
        error: {
          code: 'RESERVATION_EXPIRATION_FAILED',
          message: 'RESERVATION_EXPIRATION_FAILED',
        },
      }
    }
  },
)
