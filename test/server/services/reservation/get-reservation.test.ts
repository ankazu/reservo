import { describe, expect, it, vi } from 'vitest'

const repository = vi.hoisted(() => ({
  findReservationById: vi.fn(),
  findReservationItems: vi.fn(),
}))

vi.mock('../../../../server/repositories/reservation', () => repository)

import {
  getReservation,
  ReservationLookupError,
} from '../../../../server/services/reservation/get-reservation'

describe('get reservation service', () => {
  const accessToken = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  const accessTokenHash =
    '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a'
  const database = {
    transaction: async (callback: (tx: object) => Promise<unknown>) =>
      callback({}),
  }

  it('returns reservation details with historical item snapshots', async () => {
    const reservation = {
      id: 'reservation-1',
      propertyId: 'property-1',
      status: 'CONFIRMED',
      guestName: 'Guest',
      guestEmail: 'guest@example.com',
      guestCount: 2,
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-12',
      subtotalAmount: 11600,
      taxesAmount: 0,
      discountsAmount: 0,
      totalAmount: 11600,
      cancellableUntil: new Date('2026-08-09T16:00:00Z'),
      expiresAt: null,
      idempotencyKey: 'internal-key',
      requestFingerprint: 'internal-fingerprint',
      accessTokenHash,
    }
    const item = {
      id: 'item-1',
      reservationId: 'reservation-1',
      roomTypeId: 'room-1',
      roomTypeNameSnapshot: 'Original room name',
      ratePlanNameSnapshot: 'Standard',
      nightlyPrice: 5800,
      taxes: 0,
      discounts: 0,
      quantity: 1,
    }
    repository.findReservationById.mockResolvedValue(reservation)
    repository.findReservationItems.mockResolvedValue([item])

    await expect(
      getReservation(database as never, 'reservation-1', accessToken),
    ).resolves.toEqual({
      id: reservation.id,
      propertyId: reservation.propertyId,
      status: reservation.status,
      guestName: reservation.guestName,
      guestEmail: reservation.guestEmail,
      guestCount: reservation.guestCount,
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      nights: 2,
      price: {
        currency: 'TWD',
        subtotal: reservation.subtotalAmount,
        taxes: reservation.taxesAmount,
        discounts: reservation.discountsAmount,
        total: reservation.totalAmount,
      },
      cancellableUntil: reservation.cancellableUntil,
      expiresAt: reservation.expiresAt,
      items: [item],
    })
  })

  it('raises a stable not-found error', async () => {
    repository.findReservationById.mockResolvedValue(undefined)

    await expect(
      getReservation(database as never, 'missing', accessToken),
    ).rejects.toEqual(new ReservationLookupError('RESERVATION_NOT_FOUND'))
  })

  it.each([
    ['missing token', ''],
    ['malformed token', 'short'],
    ['token for another reservation', 'B'.repeat(43)],
  ])('does not return guest details for %s', async (_case, token) => {
    repository.findReservationById.mockResolvedValue({
      id: 'reservation-1',
      accessTokenHash,
      guestName: 'Private Guest',
      guestEmail: 'private@example.com',
    })

    const result = getReservation(database as never, 'reservation-1', token)

    await expect(result).rejects.toEqual(
      new ReservationLookupError('RESERVATION_NOT_FOUND'),
    )
    await expect(result).rejects.not.toMatchObject({
      guestName: 'Private Guest',
      guestEmail: 'private@example.com',
    })
  })
})
