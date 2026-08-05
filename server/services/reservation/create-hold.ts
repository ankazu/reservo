import {
  getCancellableUntil,
  getNightCount,
  getStayDates,
} from '../../../shared/types/reservation'
import { HOLD_DURATION_MS } from '../../../shared/constants/reservation-policy'
import { calculatePriceQuote } from '../../../shared/utils/pricing'
import { getReservationRequestFingerprint } from '../../../shared/utils/reservation-request'
import type { CreateReservationInput } from './types'
import {
  createReservation,
  createReservationItem,
  findReservationByIdempotencyKey,
  findProperty,
  findRoomType,
  lockInventoryForStay,
  provisionInventoryForStay,
  reserveInventory,
} from '../../repositories/reservation'
import { getAvailableQuantity } from './rules'
import { toReservationResponse } from './response'
import type { db } from '../../utils/db'
import {
  createReservationAccessToken,
  hashReservationAccessToken,
} from '../../utils/reservation-access'

type Database = NonNullable<typeof db>

export class ReservationServiceError extends Error {
  constructor(
    readonly code:
      | 'ROOM_TYPE_NOT_FOUND'
      | 'PROPERTY_NOT_FOUND'
      | 'GUEST_LIMIT_EXCEEDED'
      | 'INVENTORY_NOT_READY'
      | 'INSUFFICIENT_INVENTORY'
      | 'IDEMPOTENCY_PAYLOAD_MISMATCH'
      | 'IDEMPOTENCY_FINGERPRINT_UNAVAILABLE',
  ) {
    super(code)
  }
}

export async function createReservationHold(
  database: Database,
  input: CreateReservationInput,
  idempotencyKey: string,
  requestFingerprint = getReservationRequestFingerprint(input),
) {
  try {
    return await database.transaction(async (tx) => {
      const existing = await findReservationByIdempotencyKey(
        tx,
        input.propertyId,
        idempotencyKey,
      )
      if (existing) {
        assertMatchingFingerprint(
          existing.requestFingerprint,
          requestFingerprint,
        )
        return toReservationResponse(existing)
      }

      const roomType = await findRoomType(tx, input.roomTypeId)
      const property = await findProperty(tx, input.propertyId)
      if (!property) {
        throw new ReservationServiceError('PROPERTY_NOT_FOUND')
      }
      if (!roomType || roomType.propertyId !== input.propertyId) {
        throw new ReservationServiceError('ROOM_TYPE_NOT_FOUND')
      }
      if (input.guests > roomType.maxGuests) {
        throw new ReservationServiceError('GUEST_LIMIT_EXCEEDED')
      }

      const nights = getNightCount(input)
      const quote = calculatePriceQuote({
        nightlyPrice: roomType.nightlyPrice,
        nights,
        quantity: input.quantity,
      })
      await provisionInventoryForStay(tx, input.roomTypeId, getStayDates(input))
      const inventory = await lockInventoryForStay(
        tx,
        input.roomTypeId,
        input.checkInDate,
        input.checkOutDate,
      )

      // A concurrent request with the same key may have waited on these
      // inventory locks while the first transaction created its reservation.
      // Re-check after the lock so it receives the original result instead of
      // incorrectly failing on the now-reserved inventory.
      const existingAfterInventoryLock = await findReservationByIdempotencyKey(
        tx,
        input.propertyId,
        idempotencyKey,
      )
      if (existingAfterInventoryLock) {
        assertMatchingFingerprint(
          existingAfterInventoryLock.requestFingerprint,
          requestFingerprint,
        )
        return toReservationResponse(existingAfterInventoryLock)
      }

      if (inventory.length !== nights) {
        throw new ReservationServiceError('INVENTORY_NOT_READY')
      }
      if (
        inventory.some(
          (row) =>
            getAvailableQuantity(
              row.totalQuantity,
              row.reservedQuantity,
              row.blockedQuantity,
            ) < input.quantity,
        )
      ) {
        throw new ReservationServiceError('INSUFFICIENT_INVENTORY')
      }

      for (const row of inventory) {
        await reserveInventory(tx, row.id, input.quantity)
      }

      const accessToken = createReservationAccessToken()
      const reservation = await createReservation(tx, {
        propertyId: input.propertyId,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        guestCount: input.guests,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        subtotalAmount: quote.subtotal,
        taxesAmount: quote.taxes,
        discountsAmount: quote.discounts,
        totalAmount: quote.total,
        cancellableUntil: getCancellableUntil(input.checkInDate),
        expiresAt: new Date(Date.now() + HOLD_DURATION_MS),
        idempotencyKey,
        requestFingerprint,
        accessTokenHash: hashReservationAccessToken(accessToken),
      })

      await createReservationItem(tx, {
        reservationId: reservation.id,
        roomTypeId: roomType.id,
        roomTypeNameSnapshot: roomType.name,
        ratePlanNameSnapshot: input.ratePlanName,
        nightlyPrice: roomType.nightlyPrice,
        taxes: 0,
        discounts: 0,
        quantity: input.quantity,
      })

      return {
        ...toReservationResponse(reservation),
        accessToken,
        accessUrl: `/#reservationId=${reservation.id}&accessToken=${accessToken}`,
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await database.transaction((tx) =>
        findReservationByIdempotencyKey(tx, input.propertyId, idempotencyKey),
      )
      if (existing) {
        assertMatchingFingerprint(
          existing.requestFingerprint,
          requestFingerprint,
        )
        return toReservationResponse(existing)
      }
    }
    throw error
  }
}

export function assertMatchingFingerprint(
  existingFingerprint: string | null,
  requestFingerprint: string,
) {
  if (existingFingerprint === null) {
    throw new ReservationServiceError('IDEMPOTENCY_FINGERPRINT_UNAVAILABLE')
  }
  if (existingFingerprint !== requestFingerprint) {
    throw new ReservationServiceError('IDEMPOTENCY_PAYLOAD_MISMATCH')
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  )
}
