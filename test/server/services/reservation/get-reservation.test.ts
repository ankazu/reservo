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
      expiresAt: null,
      idempotencyKey: 'internal-key',
      requestFingerprint: 'internal-fingerprint',
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
      getReservation(database as never, 'reservation-1'),
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
      totalAmount: reservation.totalAmount,
      expiresAt: reservation.expiresAt,
      items: [item],
    })
  })

  it('raises a stable not-found error', async () => {
    repository.findReservationById.mockResolvedValue(undefined)

    await expect(getReservation(database as never, 'missing')).rejects.toEqual(
      new ReservationLookupError('RESERVATION_NOT_FOUND'),
    )
  })
})
