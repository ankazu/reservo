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

export class ReservationServiceError extends Error {
  constructor(
    readonly code:
      'ROOM_TYPE_NOT_FOUND' | 'INVENTORY_NOT_READY' | 'INSUFFICIENT_INVENTORY',
  ) {
    super(code)
  }
}

export async function createReservationHold(
  tx: Parameters<
    Parameters<
      NonNullable<typeof import('../../utils/db').db>['transaction']
    >[0]
  >[0],
  input: CreateReservationInput,
  idempotencyKey: string,
) {
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
    nightlyPrice: input.nightlyPrice,
    taxes: input.taxes,
    discounts: input.discounts,
    quantity: input.quantity,
  })

  return reservation
}
