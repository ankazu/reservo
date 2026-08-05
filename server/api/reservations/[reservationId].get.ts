import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'

import { reservationIdSchema } from '../../../shared/schemas/reservation'
import type { ApiResponse } from '../../../shared/types/api'
import {
  getReservation,
  ReservationLookupError,
} from '../../services/reservation/get-reservation'
import { db } from '../../utils/db'
import {
  enforceClientRateLimit,
  reservationLookupRateLimiter,
} from '../../utils/request-guards'
import { getReservationAccessToken } from '../../utils/reservation-access'

export default defineEventHandler(
  async (event): Promise<ApiResponse<unknown>> => {
    const rateLimit = enforceClientRateLimit(
      event,
      reservationLookupRateLimiter,
    )
    if (rateLimit) return rateLimit

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
      return {
        success: true,
        data: await getReservation(db, reservationId, accessToken),
      }
    } catch (error) {
      if (error instanceof ReservationLookupError) {
        setResponseStatus(event, 404)
        return {
          success: false,
          error: { code: error.code, message: error.code },
        }
      }
      setResponseStatus(event, 500)
      return {
        success: false,
        error: {
          code: 'RESERVATION_LOOKUP_FAILED',
          message: 'RESERVATION_LOOKUP_FAILED',
        },
      }
    }
  },
)
