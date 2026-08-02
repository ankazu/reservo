import { describe, expect, it } from 'vitest'

import {
  canTransitionReservation,
  canCancelReservation,
  getAvailableQuantity,
  getNightCount,
  getStayDates,
} from '../../../../server/services/reservation/rules'
import { summarizeAvailability } from '../../../../server/services/reservation/availability'
import { calculatePriceQuote } from '../../../../shared/utils/pricing'
import { getCancellableUntil } from '../../../../shared/types/reservation'

describe('reservation rules', () => {
  it('counts nights using a half-open date range', () => {
    expect(
      getNightCount({ checkInDate: '2026-08-10', checkOutDate: '2026-08-13' }),
    ).toBe(3)
  })

  it('generates only the nights in a half-open stay range', () => {
    expect(
      getStayDates({ checkInDate: '2026-08-10', checkOutDate: '2026-08-13' }),
    ).toEqual(['2026-08-10', '2026-08-11', '2026-08-12'])
  })

  it('calculates availability from inventory quantities', () => {
    expect(getAvailableQuantity(5, 2, 1)).toBe(2)
  })

  it('calculates an integer TWD quote from nights and quantity', () => {
    expect(
      calculatePriceQuote({ nightlyPrice: 4200, nights: 3, quantity: 2 }),
    ).toEqual({
      currency: 'TWD',
      nightlyPrice: 4200,
      subtotal: 25200,
      taxes: 0,
      discounts: 0,
      total: 25200,
    })
  })

  it('applies integer taxes and discounts without floating point arithmetic', () => {
    expect(
      calculatePriceQuote({
        nightlyPrice: 5800,
        nights: 2,
        quantity: 1,
        taxes: 500,
        discounts: 1000,
      }).total,
    ).toBe(11100)
  })

  it('allows only documented reservation transitions', () => {
    expect(canTransitionReservation('PENDING_PAYMENT', 'CONFIRMED')).toBe(true)
    expect(canTransitionReservation('CONFIRMED', 'EXPIRED')).toBe(false)
    expect(canTransitionReservation('CANCELLED', 'CONFIRMED')).toBe(false)
  })

  it('does not allow terminal reservations to transition again', () => {
    expect(canTransitionReservation('CANCELLED', 'EXPIRED')).toBe(false)
    expect(canTransitionReservation('EXPIRED', 'CANCELLED')).toBe(false)
  })

  it('allows cancellation strictly before its deadline', () => {
    const deadline = new Date('2026-08-10T00:00:00Z')
    expect(
      canCancelReservation(new Date(deadline.getTime() + 1), deadline),
    ).toBe(true)
    expect(canCancelReservation(deadline, deadline)).toBe(false)
    expect(
      canCancelReservation(new Date(deadline.getTime() - 1), deadline),
    ).toBe(false)
  })

  it('uses the fixed Asia/Taipei midnight cancellation deadline', () => {
    expect(getCancellableUntil('2026-08-10')).toEqual(
      new Date('2026-08-09T16:00:00.000Z'),
    )
    expect(getCancellableUntil('2026-08-10').getTime()).toBe(
      new Date('2026-08-09T16:00:00.000Z').getTime(),
    )
  })

  it('uses half-open stay dates when summarizing availability', () => {
    const result = summarizeAvailability(
      {
        checkInDate: '2026-08-10',
        checkOutDate: '2026-08-12',
        quantity: 2,
        guests: 2,
      },
      [
        {
          stayDate: '2026-08-10',
          totalQuantity: 4,
          reservedQuantity: 1,
          blockedQuantity: 0,
        },
        {
          stayDate: '2026-08-11',
          totalQuantity: 4,
          reservedQuantity: 2,
          blockedQuantity: 0,
        },
      ],
      2,
      4200,
    )

    expect(result.nights).toBe(2)
    expect(result.availableQuantity).toBe(2)
    expect(result.available).toBe(true)
  })

  it('reports unavailable when an inventory row is missing or insufficient', () => {
    const result = summarizeAvailability(
      {
        checkInDate: '2026-08-10',
        checkOutDate: '2026-08-12',
        quantity: 2,
      },
      [
        {
          stayDate: '2026-08-10',
          totalQuantity: 4,
          reservedQuantity: 3,
          blockedQuantity: 0,
        },
      ],
      Number.POSITIVE_INFINITY,
      4200,
    )

    expect(result.inventoryReady).toBe(false)
    expect(result.available).toBe(false)
  })

  it('reports unavailable when the room cannot fit the guest count', () => {
    const result = summarizeAvailability(
      {
        checkInDate: '2026-08-10',
        checkOutDate: '2026-08-12',
        quantity: 1,
        guests: 3,
      },
      [
        {
          stayDate: '2026-08-10',
          totalQuantity: 4,
          reservedQuantity: 0,
          blockedQuantity: 0,
        },
        {
          stayDate: '2026-08-11',
          totalQuantity: 4,
          reservedQuantity: 0,
          blockedQuantity: 0,
        },
      ],
      2,
      8600,
    )

    expect(result.inventoryReady).toBe(true)
    expect(result.available).toBe(false)
  })
})
