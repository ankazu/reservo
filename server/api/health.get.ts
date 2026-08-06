import { defineEventHandler, setResponseStatus } from 'h3'

import type { ApiResponse } from '../../shared/types/api'
import { checkApplicationHealth } from '../services/health'
import { db } from '../utils/db'
import { logStructured } from '../utils/structured-logging'

type HealthStatus = {
  status: 'ok'
  database: 'up'
  checkedAt: string
}

export default defineEventHandler(
  async (event): Promise<ApiResponse<HealthStatus>> => {
    if (!db) {
      logStructured('error', { event: 'health_check_failed' })
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
      await checkApplicationHealth(db)
      return {
        success: true,
        data: {
          status: 'ok',
          database: 'up',
          checkedAt: new Date().toISOString(),
        },
      }
    } catch {
      logStructured('error', { event: 'health_check_failed' })
      setResponseStatus(event, 503)
      return {
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'HEALTH_CHECK_FAILED',
        },
      }
    }
  },
)
