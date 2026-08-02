import { describe, expect, it } from 'vitest'

import { createAvailabilityMock } from '../../../app/mocks/availability'
import { createReservationsMock } from '../../../app/mocks/reservations'

const input = {
  roomTypeId: 'room-1',
  checkInDate: '2026-08-10',
  checkOutDate: '2026-08-13',
  quantity: 1,
  guests: 2,
  propertyId: 'property-1',
  guestName: 'Guest',
  guestEmail: 'guest@example.com',
  ratePlanName: 'Standard' as const,
}

describe('mock scenarios', () => {
  it('calculates the correct number of nights', async () => {
    const response = await createAvailabilityMock('success')(input)

    expect(response).toMatchObject({
      success: true,
      data: {
        nights: 3,
        price: { nightlyPrice: 4200, subtotal: 12600, total: 12600 },
      },
    })
  })

  it('preserves idempotency behavior and rejects payload changes', async () => {
    const mock = createReservationsMock('success')
    const first = await mock.createHold(input, 'key-1')
    const second = await mock.createHold(input, 'key-1')
    const changed = await mock.createHold(
      { ...input, checkOutDate: '2026-08-14' },
      'key-1',
    )

    expect(second).toEqual(first)
    expect(changed).toMatchObject({
      success: false,
      error: { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' },
    })
  })

  it('enforces expiry and legal transition rules', async () => {
    const expired = createReservationsMock('expired-reservation')
    await expired.createHold(input, 'expired-key')
    const expiredConfirm = await expired.transition(
      '/api/reservations/mock-1/confirm',
    )
    expect(expiredConfirm).toMatchObject({
      success: false,
      error: { code: 'RESERVATION_EXPIRED' },
    })

    const active = createReservationsMock('success')
    await active.createHold(input, 'active-key')
    expect(
      await active.transition('/api/reservations/mock-1/confirm'),
    ).toMatchObject({
      success: true,
      data: { status: 'CONFIRMED' },
    })
    expect(
      await active.transition('/api/reservations/mock-1/expire'),
    ).toMatchObject({
      success: false,
      error: { code: 'INVALID_STATUS_TRANSITION' },
    })
  })
})
