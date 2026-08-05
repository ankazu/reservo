import type { PriceQuote } from '../utils/pricing'

export type StaySearchInput = {
  checkInDate: string
  checkOutDate: string
  guests: number
}

export type ReservationSearchInput = StaySearchInput & {
  roomTypeId: string
  quantity: number
}

export type AvailabilityResponse = {
  checkInDate: string
  checkOutDate: string
  nights: number
  requestedQuantity: number
  availableQuantity: number
  available: boolean
  inventoryReady: boolean
  price: PriceQuote
}
