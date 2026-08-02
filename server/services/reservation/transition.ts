import type { ReservationStatus } from '../../../shared/types/reservation'
import {
  findReservationItems,
  lockExpiredReservations,
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

export async function expireReservations(
  database: Database,
  options: { now?: Date; limit?: number } = {},
) {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 100

  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('expiration limit must be a positive integer')
  }

  return database.transaction(async (tx) => {
    const candidates = await lockExpiredReservations(tx, now, limit)
    const expired = []
    for (const candidate of candidates) {
      expired.push(
        await transitionReservationInTransaction(
          tx,
          candidate.id,
          'EXPIRED',
          now,
        ),
      )
    }
    return expired
  })
}

async function transitionReservationInTransaction(
  tx: Transaction,
  reservationId: string,
  targetStatus: ReservationStatus,
  now = new Date(),
) {
  const reservation = await lockReservation(tx, reservationId)
  if (!reservation) {
    throw new ReservationTransitionError('RESERVATION_NOT_FOUND')
  }

  if (reservation.status === targetStatus) return reservation
  if (!canTransitionReservation(reservation.status, targetStatus)) {
    throw new ReservationTransitionError('INVALID_STATUS_TRANSITION')
  }

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
