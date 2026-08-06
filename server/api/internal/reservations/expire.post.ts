import { defineEventHandler, getHeader, setResponseStatus } from 'h3'

import type { ApiResponse } from '../../../../shared/types/api'
import {
  expireReservations,
  getExpirationBacklog,
} from '../../../services/reservation/transition'
import { isMaintenanceSecretValid } from '../../../utils/maintenance-auth'
import { db } from '../../../utils/db'
import { logStructured } from '../../../utils/structured-logging'

type ExpirationReport = {
  completedAt: string
  expiredCount: number
  backlogCount: number
}

export default defineEventHandler(
  async (event): Promise<ApiResponse<ExpirationReport>> => {
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
      logStructured('error', { event: 'reservation_expiration_failed' })
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
      const completedAt = new Date().toISOString()
      const backlogCount = await getExpirationBacklog(db, new Date(completedAt))
      const data = {
        completedAt,
        expiredCount: expired.length,
        backlogCount,
      }
      logStructured('info', {
        event: 'reservation_expiration_completed',
        ...data,
      })
      return { success: true, data }
    } catch {
      logStructured('error', { event: 'reservation_expiration_failed' })
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
