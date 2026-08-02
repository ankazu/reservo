import { defineEventHandler, getHeader, readBody, setResponseStatus } from 'h3'

import { createReservationSchema } from '../../shared/schemas/reservation'
import type { ApiResponse } from '../../shared/types/api'
import { getReservationRequestFingerprint } from '../../shared/utils/reservation-request'
import {
  createReservationHold,
  ReservationServiceError,
} from '../services/reservation/create-hold'
import { db } from '../utils/db'

export default defineEventHandler(
  async (event): Promise<ApiResponse<unknown>> => {
    const idempotencyKey = getHeader(event, 'idempotency-key')?.trim()
    const requestFingerprint = getHeader(event, 'x-request-fingerprint')?.trim()
    if (!idempotencyKey) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'IDEMPOTENCY_KEY_REQUIRED',
        },
      }
    }
    if (!requestFingerprint) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: {
          code: 'REQUEST_FINGERPRINT_REQUIRED',
          message: 'REQUEST_FINGERPRINT_REQUIRED',
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

    const parsed = createReservationSchema.safeParse(await readBody(event))
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
    if (requestFingerprint !== getReservationRequestFingerprint(parsed.data)) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: {
          code: 'REQUEST_FINGERPRINT_INVALID',
          message: 'REQUEST_FINGERPRINT_INVALID',
        },
      }
    }

    try {
      const reservation = await createReservationHold(
        db,
        parsed.data,
        idempotencyKey,
        requestFingerprint,
      )
      return { success: true, data: reservation }
    } catch (error) {
      if (error instanceof ReservationServiceError) {
        setResponseStatus(event, 409)
        return {
          success: false,
          error: { code: error.code, message: error.code },
        }
      }
      setResponseStatus(event, 500)
      return {
        success: false,
        error: { code: 'RESERVATION_FAILED', message: 'RESERVATION_FAILED' },
      }
    }
  },
)
