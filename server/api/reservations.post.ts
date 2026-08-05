import { defineEventHandler, getHeader, setResponseStatus } from 'h3'

import {
  MAX_IDEMPOTENCY_KEY_BYTES,
  MAX_REQUEST_FINGERPRINT_BYTES,
  MAX_RESERVATION_BODY_BYTES,
} from '../../shared/constants/reservation-policy'
import { createReservationPolicySchema } from '../../shared/schemas/reservation'
import type { ApiResponse } from '../../shared/types/api'
import { getReservationRequestFingerprint } from '../../shared/utils/reservation-request'
import {
  createReservationHold,
  ReservationServiceError,
} from '../services/reservation/create-hold'
import { db } from '../utils/db'
import {
  enforceClientRateLimit,
  enforceRateLimit,
  holdEmailRateLimiter,
  holdIpRateLimiter,
  isHeaderWithinByteLimit,
  readLimitedJsonBody,
} from '../utils/request-guards'

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
    if (!isHeaderWithinByteLimit(idempotencyKey, MAX_IDEMPOTENCY_KEY_BYTES)) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: {
          code: 'IDEMPOTENCY_KEY_INVALID',
          message: 'IDEMPOTENCY_KEY_INVALID',
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
    if (
      !isHeaderWithinByteLimit(
        requestFingerprint,
        MAX_REQUEST_FINGERPRINT_BYTES,
      )
    ) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: {
          code: 'REQUEST_FINGERPRINT_INVALID',
          message: 'REQUEST_FINGERPRINT_INVALID',
        },
      }
    }

    const ipRateLimit = enforceClientRateLimit(
      event,
      holdIpRateLimiter,
      idempotencyKey,
    )
    if (ipRateLimit) return ipRateLimit

    const bodyResult = await readLimitedJsonBody(
      event,
      MAX_RESERVATION_BODY_BYTES,
    )
    if (!bodyResult.success) {
      setResponseStatus(event, bodyResult.tooLarge ? 413 : 400)
      const code = bodyResult.tooLarge
        ? 'REQUEST_BODY_TOO_LARGE'
        : 'INVALID_REQUEST'
      return { success: false, error: { code, message: code } }
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

    const parsed = createReservationPolicySchema().safeParse(bodyResult.body)
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
    const emailRateLimit = enforceRateLimit(
      event,
      holdEmailRateLimiter,
      parsed.data.guestEmail.toLowerCase(),
      idempotencyKey,
    )
    if (emailRateLimit) return emailRateLimit
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
        setResponseStatus(
          event,
          error.code === 'PROPERTY_NOT_FOUND' ? 404 : 409,
        )
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
