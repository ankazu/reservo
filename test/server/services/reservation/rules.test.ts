import { describe, expect, it } from 'vitest'

import {
  canTransitionReservation,
  getAvailableQuantity,
  getNightCount,
  getStayDates,
} from '../../../../server/services/reservation/rules'
import { summarizeAvailability } from '../../../../server/services/reservation/availability'

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

  it('allows only documented reservation transitions', () => {
    expect(canTransitionReservation('PENDING_PAYMENT', 'CONFIRMED')).toBe(true)
    expect(canTransitionReservation('CONFIRMED', 'EXPIRED')).toBe(false)
    expect(canTransitionReservation('CANCELLED', 'CONFIRMED')).toBe(false)
  })

  it('does not allow terminal reservations to transition again', () => {
    expect(canTransitionReservation('CANCELLED', 'EXPIRED')).toBe(false)
    expect(canTransitionReservation('EXPIRED', 'CANCELLED')).toBe(false)
  })

  it('uses half-open stay dates when summarizing availability', () => {
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
    )

    expect(result.inventoryReady).toBe(false)
    expect(result.available).toBe(false)
  })
})
