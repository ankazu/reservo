import { getNightCount, getStayDates } from '../../../shared/types/reservation'
export function getAvailableQuantity(
  totalQuantity: number,
  reservedQuantity: number,
  blockedQuantity: number,
): number {
  return totalQuantity - reservedQuantity - blockedQuantity
}

export function canCancelReservation(
  cancellableUntil: Date,
  now: Date,
): boolean {
  return cancellableUntil > now
}

export {
  canTransitionReservation,
  getNightCount,
  getStayDates,
} from '../../../shared/types/reservation'
