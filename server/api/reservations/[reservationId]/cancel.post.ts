import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'

import type { ApiResponse } from '../../../../shared/types/api'
import {
  ReservationTransitionError,
  transitionReservation,
} from '../../../services/reservation/transition'
import { db } from '../../../utils/db'

export default defineEventHandler(
  async (event): Promise<ApiResponse<unknown>> => {
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
    const reservationId = getRouterParam(event, 'reservationId')
    if (!reservationId) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: {
          code: 'INVALID_RESERVATION_ID',
          message: 'INVALID_RESERVATION_ID',
        },
      }
    }

    try {
      const reservation = await db.transaction((tx) =>
        transitionReservation(tx, reservationId, 'CANCELLED'),
      )
      return { success: true, data: reservation }
    } catch (error) {
      if (error instanceof ReservationTransitionError) {
        setResponseStatus(
          event,
          error.code === 'RESERVATION_NOT_FOUND' ? 404 : 409,
        )
        return {
          success: false,
          error: { code: error.code, message: error.code },
        }
      }
      throw error
    }
  },
)
