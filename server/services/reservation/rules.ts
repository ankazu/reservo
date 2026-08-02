import { getNightCount } from '../../../shared/types/reservation'
import type { ReservationStatus } from '../../../shared/types/reservation'

export function getAvailableQuantity(
  totalQuantity: number,
  reservedQuantity: number,
  blockedQuantity: number,
): number {
  return totalQuantity - reservedQuantity - blockedQuantity
}

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

export { getNightCount }
