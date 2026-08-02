import { describe, expect, it } from 'vitest'

import {
  createReservationSchema,
  reservationSearchSchema,
} from '../../../shared/schemas/reservation'

const validDates = {
  checkInDate: '2026-08-10',
  checkOutDate: '2026-08-12',
}

describe('reservation schemas', () => {
  it('accepts a valid availability search and defaults quantity', () => {
    const result = reservationSearchSchema.safeParse({
      roomTypeId: '11111111-1111-4111-8111-111111111111',
      ...validDates,
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.quantity).toBe(1)
  })

  it('rejects checkout dates that do not follow check-in', () => {
    const result = reservationSearchSchema.safeParse({
      roomTypeId: '11111111-1111-4111-8111-111111111111',
      checkInDate: '2026-08-12',
      checkOutDate: '2026-08-12',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.checkOutDate).toContain(
        'check_out_must_be_after_check_in',
      )
    }
  })

  it('rejects malformed dates and invalid guest email', () => {
    const result = createReservationSchema.safeParse({
      propertyId: '11111111-1111-4111-8111-111111111111',
      roomTypeId: '22222222-2222-4222-8222-222222222222',
      ...validDates,
      guestName: 'Guest',
      guestEmail: 'not-an-email',
      nightlyPrice: 4200,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.guestEmail).toBeDefined()
    }
  })

  it('rejects dates that are not real calendar dates', () => {
    const result = reservationSearchSchema.safeParse({
      roomTypeId: '11111111-1111-4111-8111-111111111111',
      checkInDate: '2026-02-30',
      checkOutDate: '2026-03-02',
    })

    expect(result.success).toBe(false)
  })
})
