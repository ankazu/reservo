import type { CreateReservationHoldInput } from '../types/reservation'

export function getReservationRequestFingerprint(
  input: CreateReservationHoldInput,
): string {
  return JSON.stringify({
    propertyId: input.propertyId,
    roomTypeId: input.roomTypeId,
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    quantity: input.quantity,
    guestName: input.guestName,
    guestEmail: input.guestEmail,
    ratePlanName: input.ratePlanName,
  })
}
