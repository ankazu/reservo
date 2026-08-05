import { describe, expect, it, vi } from 'vitest'

import { createAvailabilityApi } from '../../../app/api/availability'
import { createFetchApiClient } from '../../../app/api/client'
import { createReservationsApi } from '../../../app/api/reservations'
import { AppError } from '../../../app/api/errors'
import type { ApiClient } from '../../../app/api/client'

function createFakeClient(): ApiClient & {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
} {
  return {
    get: vi.fn(),
    post: vi.fn(),
  }
}

describe('availability API module', () => {
  it('builds the query and unwraps successful responses', async () => {
    const client = createFakeClient()
    client.get.mockResolvedValue({
      success: true,
      data: {
        checkInDate: '2026-08-10',
        checkOutDate: '2026-08-12',
        nights: 2,
        requestedQuantity: 1,
        availableQuantity: 2,
        available: true,
        inventoryReady: true,
        price: {
          currency: 'TWD',
          nightlyPrice: 4200,
          subtotal: 8400,
          taxes: 0,
          discounts: 0,
          total: 8400,
        },
      },
    })

    const input = {
      roomTypeId: 'room-1',
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-12',
      quantity: 1,
      guests: 2,
    }
    const result = await createAvailabilityApi(client).getAvailability(input)

    expect(result.available).toBe(true)
    expect(client.get).toHaveBeenCalledWith('/api/availability', {
      query: input,
    })
  })

  it('maps a failed API response to AppError', async () => {
    const client = createFakeClient()
    client.get.mockResolvedValue({
      success: false,
      error: { code: 'INSUFFICIENT_INVENTORY', message: 'server fallback' },
    })

    await expect(
      createAvailabilityApi(client).getAvailability({
        roomTypeId: 'room-1',
        checkInDate: '2026-08-10',
        checkOutDate: '2026-08-12',
        quantity: 1,
        guests: 2,
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_INVENTORY' })
  })
})

describe('fetch API client', () => {
  it.each([null, undefined, 'connection failed', 0])(
    'normalizes primitive rejection %s into AppError',
    async (cause) => {
      const request = vi.fn().mockRejectedValue(cause)
      const client = createFetchApiClient(request as never)

      await expect(client.get('/api/availability')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      })
    },
  )
})

describe('reservation API module', () => {
  it('gets reservation details by id', async () => {
    const client = createFakeClient()
    client.get.mockResolvedValue({
      success: true,
      data: { id: 'reservation-1', items: [] },
    })

    await createReservationsApi(client).getReservation(
      'reservation-1',
      'access-token',
    )

    expect(client.get).toHaveBeenCalledWith('/api/reservations/reservation-1', {
      headers: { Authorization: 'Bearer access-token' },
    })
  })

  it('sends the idempotency key and forwards abort signals', async () => {
    const client = createFakeClient()
    client.post.mockResolvedValue({
      success: true,
      data: {
        id: 'reservation-1',
        propertyId: 'property-1',
        status: 'PENDING_PAYMENT',
        guestName: 'Guest',
        guestEmail: 'guest@example.com',
        checkInDate: '2026-08-10',
        checkOutDate: '2026-08-12',
        expiresAt: null,
      },
    })
    const controller = new AbortController()
    const input = {
      propertyId: 'property-1',
      roomTypeId: 'room-1',
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-12',
      quantity: 1,
      guests: 2,
      guestName: 'Guest',
      guestEmail: 'guest@example.com',
      ratePlanName: 'Standard' as const,
    }

    await createReservationsApi(client).createReservationHold(input, 'key-1', {
      signal: controller.signal,
    })

    expect(client.post).toHaveBeenCalledWith('/api/reservations', input, {
      signal: controller.signal,
      headers: {
        'Idempotency-Key': 'key-1',
        'X-Request-Fingerprint': expect.any(String),
      },
    })
  })

  it('sends access credentials and keeps cancellation errors stable', async () => {
    const client = createFakeClient()
    client.post.mockResolvedValue({
      success: false,
      error: { code: 'RESERVATION_EXPIRED', message: 'server fallback' },
    })

    const error = createReservationsApi(client).cancelReservation(
      'reservation-1',
      'access-token',
    )
    await expect(error).rejects.toBeInstanceOf(AppError)
    await expect(error).rejects.toMatchObject({ code: 'RESERVATION_EXPIRED' })
    expect(client.post).toHaveBeenCalledWith(
      '/api/reservations/reservation-1/cancel',
      {},
      { headers: { Authorization: 'Bearer access-token' } },
    )
  })
})
