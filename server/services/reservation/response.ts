import type { ReservationStatus } from '../../../shared/types/reservation'

export function toReservationResponse(reservation: {
  id: string
  propertyId: string
  status: ReservationStatus
  guestName: string
  guestEmail: string
  guestCount: number
  checkInDate: string
  checkOutDate: string
  totalAmount: number
  cancellableUntil: Date
  expiresAt: Date | null
}) {
  return {
    id: reservation.id,
    propertyId: reservation.propertyId,
    status: reservation.status,
    guestName: reservation.guestName,
    guestEmail: reservation.guestEmail,
    guestCount: reservation.guestCount,
    checkInDate: reservation.checkInDate,
    checkOutDate: reservation.checkOutDate,
    totalAmount: reservation.totalAmount,
    cancellableUntil: reservation.cancellableUntil,
    expiresAt: reservation.expiresAt,
  }
}
