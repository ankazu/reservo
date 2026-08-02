import type { ReservationPriceSummary } from '../types/reservation'

export type PriceQuote = ReservationPriceSummary & {
  nightlyPrice: number
}

type PriceInput = {
  nightlyPrice: number
  nights: number
  quantity: number
  taxes?: number
  discounts?: number
}

export function calculatePriceQuote({
  nightlyPrice,
  nights,
  quantity,
  taxes = 0,
  discounts = 0,
}: PriceInput): PriceQuote {
  if (
    !Number.isSafeInteger(nightlyPrice) ||
    nightlyPrice < 0 ||
    !Number.isSafeInteger(nights) ||
    nights < 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    !Number.isSafeInteger(taxes) ||
    taxes < 0 ||
    !Number.isSafeInteger(discounts) ||
    discounts < 0
  ) {
    throw new Error('INVALID_PRICE')
  }

  const subtotal = nightlyPrice * nights * quantity
  const total = subtotal + taxes - discounts

  if (
    !Number.isSafeInteger(subtotal) ||
    !Number.isSafeInteger(total) ||
    total < 0
  ) {
    throw new Error('INVALID_PRICE')
  }

  return { currency: 'TWD', nightlyPrice, subtotal, taxes, discounts, total }
}
