export const reservationStatuses = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
] as const

export type ReservationStatus = (typeof reservationStatuses)[number]

export function canTransitionReservation(
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
  const allowed: Record<ReservationStatus, readonly ReservationStatus[]> = {
    PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
    CONFIRMED: ['CANCELLED'],
    CANCELLED: [],
    EXPIRED: [],
  }

  return allowed[from].includes(to)
}

export type ReservationHold = {
  id: string
  propertyId: string
  status: 'PENDING_PAYMENT'
  guestName: string
  guestEmail: string
  guestCount: number
  checkInDate: string
  checkOutDate: string
  totalAmount: number
  cancellableUntil: string | Date
  expiresAt: string | Date | null
}

export type Reservation = Omit<ReservationHold, 'status'> & {
  status: ReservationStatus
}

export type ReservationItemSnapshot = {
  id: string
  reservationId: string
  roomTypeId: string
  roomTypeNameSnapshot: string
  ratePlanNameSnapshot: string
  nightlyPrice: number
  taxes: number
  discounts: number
  quantity: number
}

export type ReservationDetails = Omit<Reservation, 'totalAmount'> & {
  nights: number
  price: ReservationPriceSummary
  items: ReservationItemSnapshot[]
}

export type ReservationPriceSummary = {
  currency: 'TWD'
  subtotal: number
  taxes: number
  discounts: number
  total: number
}

export type CreateReservationHoldInput = DateRange & {
  propertyId: string
  roomTypeId: string
  quantity: number
  guests: number
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

export function getCancellableUntil(
  checkInDate: string,
  timeZone: string,
): Date {
  const [year, month, day] = checkInDate.split('-').map(Number)
  const targetUtc = Date.UTC(year, month - 1, day)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(targetUtc))
      .map(({ type, value }) => [type, value]),
  )
  const localAtTarget = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return new Date(targetUtc - (localAtTarget - targetUtc))
}
