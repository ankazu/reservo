import { defineEventHandler, getQuery, setResponseStatus } from 'h3'

import { reservationSearchSchema } from '../../shared/schemas/reservation'
import type { ApiResponse } from '../../shared/types/api'
import { getAvailability } from '../services/reservation/availability'
import { db } from '../utils/db'

export default defineEventHandler(
  async (event): Promise<ApiResponse<unknown>> => {
    const query = getQuery(event)
    const parsed = reservationSearchSchema.safeParse({
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
