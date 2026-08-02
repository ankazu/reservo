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
import { getNightCount } from '../../../shared/types/reservation'
import type { db } from '../../utils/db'

type Database = NonNullable<typeof db>

export class ReservationTransitionError extends Error {
  constructor(
    readonly code:
      | 'RESERVATION_NOT_FOUND'
      | 'INVALID_STATUS_TRANSITION'
      | 'RESERVATION_NOT_EXPIRED'
      | 'RESERVATION_EXPIRED'
      | 'INVENTORY_RELEASE_FAILED',
  ) {
    super(code)
  }
}

export async function transitionReservation(
  database: Database,
  reservationId: string,
  targetStatus: ReservationStatus,
) {
  return database.transaction((tx) =>
    transitionReservationInTransaction(tx, reservationId, targetStatus),
  )
}

async function transitionReservationInTransaction(
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

  const now = new Date()
  if (
    targetStatus === 'EXPIRED' &&
    (!reservation.expiresAt || reservation.expiresAt > now)
  ) {
    throw new ReservationTransitionError('RESERVATION_NOT_EXPIRED')
  }
  if (
    targetStatus === 'CONFIRMED' &&
    reservation.expiresAt !== null &&
    reservation.expiresAt <= now
  ) {
    throw new ReservationTransitionError('RESERVATION_EXPIRED')
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
        const released = await releaseInventory(tx, row.id, item.quantity)
        if (!released) {
          throw new ReservationTransitionError('INVENTORY_RELEASE_FAILED')
        }
      }
      if (inventory.length !== getNightCount(reservation)) {
        throw new ReservationTransitionError('INVENTORY_RELEASE_FAILED')
      }
    }
  }

  return updateReservationStatus(tx, reservation.id, targetStatus)
}
