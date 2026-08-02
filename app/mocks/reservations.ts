import type { ApiResponse } from '~~/shared/types/api'
import type {
  CreateReservationHoldInput,
  Reservation,
  ReservationHold,
} from '~~/shared/types/reservation'
import {
  canTransitionReservation,
  getCancellableUntil,
  getNightCount,
} from '~~/shared/types/reservation'
import { calculatePriceQuote } from '~~/shared/utils/pricing'
import { getReservationRequestFingerprint } from '~~/shared/utils/reservation-request'
import type { MockScenario } from './scenario'

type MockReservation = ReservationHold | Reservation

export function createReservationsMock(scenario: MockScenario) {
  const holds = new Map<
    string,
    { fingerprint: string; reservation: MockReservation }
  >()

  return {
    async createHold(
      input: CreateReservationHoldInput,
      idempotencyKey: string,
    ): Promise<ApiResponse<ReservationHold>> {
      if (scenario === 'invalid-request') {
        return {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'INVALID_REQUEST' },
        }
      }
      if (scenario === 'insufficient-inventory') {
        return {
          success: false,
          error: {
            code: 'INSUFFICIENT_INVENTORY',
            message: 'INSUFFICIENT_INVENTORY',
          },
        }
      }
      if (scenario === 'server-error') {
        return {
          success: false,
          error: { code: 'RESERVATION_FAILED', message: 'RESERVATION_FAILED' },
        }
      }

      const fingerprint = getReservationRequestFingerprint(input)
      const existing = holds.get(idempotencyKey)
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return {
            success: false,
            error: {
              code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
              message: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            },
          }
        }
        return { success: true, data: existing.reservation as ReservationHold }
      }

      const reservation: ReservationHold = {
        id: `mock-${holds.size + 1}`,
        propertyId: input.propertyId,
        status: 'PENDING_PAYMENT',
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        guestCount: input.guests,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        totalAmount: calculatePriceQuote({
          nightlyPrice: 4200,
          nights: getNightCount(input),
          quantity: input.quantity,
        }).total,
        cancellableUntil: getCancellableUntil(
          input.checkInDate,
          'Asia/Taipei',
        ).toISOString(),
        expiresAt:
          scenario === 'expired-reservation'
            ? new Date(Date.now() - 60_000).toISOString()
            : new Date(Date.now() + 900_000).toISOString(),
      }
      holds.set(idempotencyKey, { fingerprint, reservation })
      return { success: true, data: reservation }
    },
    async transitionTo(
      status: Reservation['status'],
    ): Promise<ApiResponse<Reservation>> {
      const entry = [...holds.values()][0]
      if (!entry) {
        return {
          success: false,
          error: {
            code: 'RESERVATION_NOT_FOUND',
            message: 'RESERVATION_NOT_FOUND',
          },
        }
      }
      const reservation = entry.reservation
      if (reservation.status === status) {
        return { success: true, data: reservation as Reservation }
      }

      if (!canTransitionReservation(reservation.status, status)) {
        return {
          success: false,
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: 'INVALID_STATUS_TRANSITION',
          },
        }
      }
      const expiresAt = reservation.expiresAt
        ? new Date(reservation.expiresAt).getTime()
        : null
      if (
        status === 'CONFIRMED' &&
        expiresAt !== null &&
        expiresAt <= Date.now()
      ) {
        return {
          success: false,
          error: {
            code: 'RESERVATION_EXPIRED',
            message: 'RESERVATION_EXPIRED',
          },
        }
      }
      if (
        status === 'EXPIRED' &&
        (expiresAt === null || expiresAt > Date.now())
      ) {
        return {
          success: false,
          error: {
            code: 'RESERVATION_NOT_EXPIRED',
            message: 'RESERVATION_NOT_EXPIRED',
          },
        }
      }
      if (
        status === 'CANCELLED' &&
        new Date(reservation.cancellableUntil).getTime() <= Date.now()
      ) {
        return {
          success: false,
          error: {
            code: 'RESERVATION_CANCELLATION_EXPIRED',
            message: 'RESERVATION_CANCELLATION_EXPIRED',
          },
        }
      }
      const updated = { ...reservation, status } as Reservation
      entry.reservation = updated
      return {
        success: true,
        data: updated,
      }
    },
  }
}
