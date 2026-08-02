import { describe, expect, it } from 'vitest'

import {
  createReservationSchema,
  reservationIdSchema,
  reservationSearchSchema,
} from '../../../shared/schemas/reservation'

const validDates = {
  checkInDate: '2026-08-10',
  checkOutDate: '2026-08-12',
}

describe('reservation schemas', () => {
  it('accepts UUID reservation IDs and rejects malformed IDs', () => {
    expect(
      reservationIdSchema.safeParse('11111111-1111-4111-8111-111111111111')
        .success,
    ).toBe(true)
    expect(reservationIdSchema.safeParse('reservation-1').success).toBe(false)
  })

  it('accepts a valid availability search and defaults quantity and guests', () => {
    const result = reservationSearchSchema.safeParse({
      roomTypeId: '11111111-1111-4111-8111-111111111111',
      ...validDates,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quantity).toBe(1)
      expect(result.data.guests).toBe(1)
    }
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

  it('does not accept client-controlled monetary fields', () => {
    const result = createReservationSchema.safeParse({
      propertyId: '11111111-1111-4111-8111-111111111111',
      roomTypeId: '22222222-2222-4222-8222-222222222222',
      ...validDates,
      guestName: 'Guest',
      guestEmail: 'guest@example.com',
      nightlyPrice: 1,
      taxes: 999999,
      discounts: 999999,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('nightlyPrice')
      expect(result.data).not.toHaveProperty('taxes')
      expect(result.data).not.toHaveProperty('discounts')
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
