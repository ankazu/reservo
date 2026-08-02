import { defineEventHandler, getQuery, setResponseStatus } from 'h3'

import { reservationSearchSchema } from '../../shared/schemas/reservation'
import type { ApiResponse } from '../../shared/types/api'
import { findInventoryForStay } from '../repositories/reservation'
import { summarizeAvailability } from '../services/reservation/availability'
import { db } from '../utils/db'

export default defineEventHandler(
  async (event): Promise<ApiResponse<unknown>> => {
    const query = getQuery(event)
    const parsed = reservationSearchSchema.safeParse({
      roomTypeId: query.roomTypeId,
      checkInDate: query.checkInDate,
      checkOutDate: query.checkOutDate,
      quantity: query.quantity ? Number(query.quantity) : undefined,
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

    const inventory = await db.transaction((tx) =>
      findInventoryForStay(
        tx,
        parsed.data.roomTypeId,
        parsed.data.checkInDate,
        parsed.data.checkOutDate,
      ),
    )

    return {
      success: true,
      data: summarizeAvailability(parsed.data, inventory),
    }
  },
)
