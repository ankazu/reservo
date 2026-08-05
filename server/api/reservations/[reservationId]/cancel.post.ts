import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'

import type { ApiResponse } from '../../../../shared/types/api'
import { reservationIdSchema } from '../../../../shared/schemas/reservation'
import {
  cancelReservation,
  ReservationTransitionError,
} from '../../../services/reservation/transition'
import { db } from '../../../utils/db'
import { getReservationAccessToken } from '../../../utils/reservation-access'

export default defineEventHandler(
  async (event): Promise<ApiResponse<unknown>> => {
    const parsedReservationId = reservationIdSchema.safeParse(
      getRouterParam(event, 'reservationId'),
    )
    if (!parsedReservationId.success) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: {
          code: 'INVALID_RESERVATION_ID',
          message: 'INVALID_RESERVATION_ID',
        },
      }
    }
    const reservationId = parsedReservationId.data
    const accessToken = getReservationAccessToken(event)
    if (!accessToken) {
      setResponseStatus(event, 404)
      return {
        success: false,
        error: {
          code: 'RESERVATION_NOT_FOUND',
          message: 'RESERVATION_NOT_FOUND',
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
      const reservation = await cancelReservation(
        db,
        reservationId,
        accessToken,
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
      setResponseStatus(event, 500)
      return {
        success: false,
        error: {
          code: 'RESERVATION_TRANSITION_FAILED',
          message: 'RESERVATION_TRANSITION_FAILED',
        },
      }
    }
  },
)
