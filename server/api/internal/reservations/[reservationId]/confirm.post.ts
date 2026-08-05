import {
  defineEventHandler,
  getHeader,
  getRouterParam,
  setResponseStatus,
} from 'h3'

import type { ApiResponse } from '../../../../../shared/types/api'
import { reservationIdSchema } from '../../../../../shared/schemas/reservation'
import {
  ReservationTransitionError,
  transitionReservation,
} from '../../../../services/reservation/transition'
import { db } from '../../../../utils/db'
import { isMaintenanceSecretValid } from '../../../../utils/maintenance-auth'

export default defineEventHandler(
  async (event): Promise<ApiResponse<unknown>> => {
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
        data: await transitionReservation(
          db,
          parsedReservationId.data,
          'CONFIRMED',
        ),
      }
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
