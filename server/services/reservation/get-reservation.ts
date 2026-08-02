import { getNightCount } from '../../../shared/types/reservation'
import type { db } from '../../utils/db'
import {
  findReservationById,
  findReservationItems,
} from '../../repositories/reservation'

type Database = NonNullable<typeof db>

export class ReservationLookupError extends Error {
  constructor(readonly code: 'RESERVATION_NOT_FOUND') {
    super(code)
  }
}

export async function getReservation(
  database: Database,
  reservationId: string,
) {
  return database.transaction(async (tx) => {
    const reservation = await findReservationById(tx, reservationId)
    if (!reservation) {
      throw new ReservationLookupError('RESERVATION_NOT_FOUND')
    }

    const items = await findReservationItems(tx, reservationId)
    return {
      id: reservation.id,
      propertyId: reservation.propertyId,
      status: reservation.status,
      guestName: reservation.guestName,
      guestEmail: reservation.guestEmail,
      guestCount: reservation.guestCount,
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      nights: getNightCount(reservation),
      price: {
        currency: 'TWD' as const,
        subtotal: reservation.subtotalAmount,
        taxes: reservation.taxesAmount,
        discounts: reservation.discountsAmount,
        total: reservation.totalAmount,
      },
      totalAmount: reservation.totalAmount,
      expiresAt: reservation.expiresAt,
      items,
    }
  })
}
