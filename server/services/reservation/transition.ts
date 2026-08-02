import type { ReservationStatus } from '../../../shared/types/reservation'
import {
  findReservationItems,
  lockInventoryForStay,
  lockReservation,
  releaseInventory,
  Transaction,
  updateReservationStatus,
} from '../../repositories/reservation'
import { canTransitionReservation } from './rules'

export class ReservationTransitionError extends Error {
  constructor(
    readonly code:
      | 'RESERVATION_NOT_FOUND'
      | 'INVALID_STATUS_TRANSITION'
      | 'INVENTORY_RELEASE_FAILED',
  ) {
    super(code)
  }
}

export async function transitionReservation(
  tx: Transaction,
  reservationId: string,
  targetStatus: ReservationStatus,
) {
  const reservation = await lockReservation(tx, reservationId)
  if (!reservation) {
    throw new ReservationTransitionError('RESERVATION_NOT_FOUND')
  }

  if (reservation.status === targetStatus) return reservation
  if (!canTransitionReservation(reservation.status, targetStatus)) {
    throw new ReservationTransitionError('INVALID_STATUS_TRANSITION')
  }

  if (targetStatus === 'CANCELLED' || targetStatus === 'EXPIRED') {
    const items = await findReservationItems(tx, reservation.id)
    for (const item of items) {
      const inventory = await lockInventoryForStay(
        tx,
        item.roomTypeId,
        reservation.checkInDate,
        reservation.checkOutDate,
      )
      for (const row of inventory) {
        await releaseInventory(tx, row.id, item.quantity)
      }
      if (inventory.length !== getNightCount(reservation)) {
        throw new ReservationTransitionError('INVENTORY_RELEASE_FAILED')
      }
    }
  }

  return updateReservationStatus(tx, reservation.id, targetStatus)
}

function getNightCount(reservation: {
  checkInDate: string
  checkOutDate: string
}) {
  return Math.round(
    (Date.parse(`${reservation.checkOutDate}T00:00:00Z`) -
      Date.parse(`${reservation.checkInDate}T00:00:00Z`)) /
      86_400_000,
  )
}
