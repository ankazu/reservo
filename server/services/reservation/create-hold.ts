import { getNightCount } from '../../../shared/types/reservation'
import type { CreateReservationInput } from './types'
import {
  createReservation,
  createReservationItem,
  findReservationByIdempotencyKey,
  findRoomType,
  lockInventoryForStay,
  reserveInventory,
} from '../../repositories/reservation'
import { getAvailableQuantity } from './rules'
import type { db } from '../../utils/db'

type Database = NonNullable<typeof db>

export class ReservationServiceError extends Error {
  constructor(
    readonly code:
      'ROOM_TYPE_NOT_FOUND' | 'INVENTORY_NOT_READY' | 'INSUFFICIENT_INVENTORY',
  ) {
    super(code)
  }
}

export async function createReservationHold(
  database: Database,
  input: CreateReservationInput,
  idempotencyKey: string,
) {
  try {
    return await database.transaction(async (tx) => {
      const existing = await findReservationByIdempotencyKey(
        tx,
        input.propertyId,
        idempotencyKey,
      )
      if (existing) return existing

      const roomType = await findRoomType(tx, input.roomTypeId)
      if (!roomType || roomType.propertyId !== input.propertyId) {
        throw new ReservationServiceError('ROOM_TYPE_NOT_FOUND')
      }

      const nights = getNightCount(input)
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
      if (existingAfterInventoryLock) return existingAfterInventoryLock

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

      const reservation = await createReservation(tx, {
        propertyId: input.propertyId,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        idempotencyKey,
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

      return reservation
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await database.transaction((tx) =>
        findReservationByIdempotencyKey(tx, input.propertyId, idempotencyKey),
      )
      if (existing) return existing
    }
    throw error
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
