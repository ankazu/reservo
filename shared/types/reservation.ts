export const reservationStatuses = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
] as const

export type ReservationStatus = (typeof reservationStatuses)[number]

export type ReservationHold = {
  id: string
  propertyId: string
  status: 'PENDING_PAYMENT'
  guestName: string
  guestEmail: string
  checkInDate: string
  checkOutDate: string
  expiresAt: string | Date | null
}

export type Reservation = Omit<ReservationHold, 'status'> & {
  status: ReservationStatus
}

export type CreateReservationHoldInput = DateRange & {
  propertyId: string
  roomTypeId: string
  quantity: number
  guestName: string
  guestEmail: string
  ratePlanName: 'Standard'
}

export type DateRange = {
  checkInDate: string
  checkOutDate: string
}

export function getNightCount({
  checkInDate,
  checkOutDate,
}: DateRange): number {
  const checkIn = Date.parse(`${checkInDate}T00:00:00Z`)
  const checkOut = Date.parse(`${checkOutDate}T00:00:00Z`)
  return Math.round((checkOut - checkIn) / 86_400_000)
}

export function getStayDates(dateRange: DateRange): string[] {
  return Array.from({ length: getNightCount(dateRange) }, (_, index) => {
    const date = new Date(`${dateRange.checkInDate}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + index)
    return date.toISOString().slice(0, 10)
  })
}
