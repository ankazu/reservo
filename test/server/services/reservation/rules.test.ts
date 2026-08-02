import { describe, expect, it } from 'vitest'

import {
  canTransitionReservation,
  getAvailableQuantity,
  getNightCount,
} from '../../../../server/services/reservation/rules'

describe('reservation rules', () => {
  it('counts nights using a half-open date range', () => {
    expect(
      getNightCount({ checkInDate: '2026-08-10', checkOutDate: '2026-08-13' }),
    ).toBe(3)
  })

  it('calculates availability from inventory quantities', () => {
    expect(getAvailableQuantity(5, 2, 1)).toBe(2)
  })

  it('allows only documented reservation transitions', () => {
    expect(canTransitionReservation('PENDING_PAYMENT', 'CONFIRMED')).toBe(true)
    expect(canTransitionReservation('CONFIRMED', 'EXPIRED')).toBe(false)
    expect(canTransitionReservation('CANCELLED', 'CONFIRMED')).toBe(false)
  })
})
