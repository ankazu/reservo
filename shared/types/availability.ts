import type { PriceQuote } from '../utils/pricing'

export type ReservationSearchInput = {
  roomTypeId: string
  checkInDate: string
  checkOutDate: string
  quantity: number
  guests: number
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
