import { defineEventHandler, getQuery, setResponseStatus } from 'h3'

import { createReservationSearchPolicySchema } from '../../shared/schemas/reservation'
import type { ApiResponse } from '../../shared/types/api'
import { getAvailability } from '../services/reservation/availability'
import { db } from '../utils/db'
import {
  availabilityRateLimiter,
  enforceClientRateLimit,
} from '../utils/request-guards'

export default defineEventHandler(
  async (event): Promise<ApiResponse<unknown>> => {
    const rateLimit = enforceClientRateLimit(event, availabilityRateLimiter)
    if (rateLimit) return rateLimit

    const query = getQuery(event)
    const parsed = createReservationSearchPolicySchema().safeParse({
      roomTypeId: query.roomTypeId,
      checkInDate: query.checkInDate,
      checkOutDate: query.checkOutDate,
      quantity: query.quantity ? Number(query.quantity) : undefined,
      guests: query.guests ? Number(query.guests) : undefined,
    })

    if (!parsed.success) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'INVALID_REQUEST',
          details: parsed.error.flatten(),
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
      return {
        success: true,
        data: await getAvailability(db, parsed.data),
      }
    } catch {
      setResponseStatus(event, 500)
      return {
        success: false,
        error: { code: 'AVAILABILITY_FAILED', message: 'AVAILABILITY_FAILED' },
      }
    }
  },
)
