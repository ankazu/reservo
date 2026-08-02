import { describe, expect, it, vi } from 'vitest'

import { AppError } from '../../../app/api/errors'
import { createReservationStore } from '../../../app/stores/reservation'
import type { AvailabilityResponse } from '../../../shared/types/availability'
import type { CreateReservationHoldInput } from '../../../shared/types/reservation'

const input = {
  roomTypeId: 'room-1',
  checkInDate: '2026-08-10',
  checkOutDate: '2026-08-12',
  quantity: 1,
}

const holdInput: CreateReservationHoldInput = {
  propertyId: 'property-1',
  ...input,
  guestName: 'Guest',
  guestEmail: 'guest@example.com',
  ratePlanName: 'Standard',
}

function availabilityResult(roomTypeId: string): AvailabilityResponse {
  return {
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    nights: 2,
    requestedQuantity: 1,
    availableQuantity: 2,
    available: true,
    inventoryReady: true,
  }
}

function createApi() {
  return {
    availability: { getAvailability: vi.fn() },
    reservations: {
      createReservationHold: vi.fn(),
      confirmReservation: vi.fn(),
      cancelReservation: vi.fn(),
      expireReservation: vi.fn(),
    },
  } as unknown as Parameters<typeof createReservationStore>[0]
}

describe('reservation store availability', () => {
  it('keeps only the latest availability request result', async () => {
    const api = createApi()
    const resolvers: Array<(value: AvailabilityResponse) => void> = []
    api.availability.getAvailability.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    )
    const store = createReservationStore(api)

    const first = store.searchAvailability(input)
    const secondInput = { ...input, roomTypeId: 'room-2' }
    const second = store.searchAvailability(secondInput)
    expect(api.availability.getAvailability).toHaveBeenCalledTimes(2)
    expect(
      api.availability.getAvailability.mock.calls[0][1].signal.aborted,
    ).toBe(true)

    resolvers[0](availabilityResult('room-1'))
    resolvers[1](availabilityResult('room-2'))
    await Promise.all([first, second])

    expect(store.availabilityByRoomTypeId.value).toEqual({
      'room-2': availabilityResult('room-2'),
    })
  })

  it('cancels and invalidates an in-flight request when availability is cleared', async () => {
    const api = createApi()
    let resolveRequest!: (value: AvailabilityResponse) => void
    api.availability.getAvailability.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )
    const store = createReservationStore(api)
    const request = store.searchAvailability(input)
    const signal = api.availability.getAvailability.mock.calls[0][1].signal

    store.clearAvailability()
    expect(signal.aborted).toBe(true)
    resolveRequest(availabilityResult(input.roomTypeId))
    await request

    expect(store.availabilityByRoomTypeId.value).toEqual({})
    expect(store.isAvailabilityLoading.value).toBe(false)
  })

  it('stores AppError codes without exposing transport errors', async () => {
    const api = createApi()
    api.availability.getAvailability.mockRejectedValue(
      new AppError('AVAILABILITY_FAILED', { status: 500 }),
    )
    const store = createReservationStore(api)

    await store.searchAvailability(input)

    expect(store.errorCode.value).toBe('AVAILABILITY_FAILED')
    expect(store.errorDetails.value).toEqual({ status: 500 })
  })
})

describe('reservation store idempotency', () => {
  it('reuses a key for retries and rotates it when the payload changes', async () => {
    const api = createApi()
    api.reservations.createReservationHold
      .mockRejectedValueOnce(new AppError('NETWORK_ERROR'))
      .mockResolvedValue({
        id: 'reservation-1',
        propertyId: holdInput.propertyId,
        status: 'PENDING_PAYMENT',
        guestName: holdInput.guestName,
        guestEmail: holdInput.guestEmail,
        checkInDate: holdInput.checkInDate,
        checkOutDate: holdInput.checkOutDate,
        expiresAt: null,
      })
    const store = createReservationStore(api)

    await store.createHold(holdInput)
    await store.createHold(holdInput)
    await store.createHold({ ...holdInput, guestName: 'Another guest' })

    const keys = api.reservations.createReservationHold.mock.calls.map(
      (call) => call[1],
    )
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[1])
  })
})

describe('reservation store transitions', () => {
  it('updates the current reservation after cancelling a hold', async () => {
    const api = createApi()
    api.reservations.cancelReservation.mockResolvedValue({
      id: 'reservation-1',
      propertyId: holdInput.propertyId,
      status: 'CANCELLED',
      guestName: holdInput.guestName,
      guestEmail: holdInput.guestEmail,
      checkInDate: holdInput.checkInDate,
      checkOutDate: holdInput.checkOutDate,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    const store = createReservationStore(api)

    const result = await store.cancelReservation('reservation-1')

    expect(api.reservations.cancelReservation).toHaveBeenCalledWith(
      'reservation-1',
    )
    expect(result?.status).toBe('CANCELLED')
    expect(store.currentReservation.value?.status).toBe('CANCELLED')
  })

  it('keeps the hold visible and exposes an error when cancellation fails', async () => {
    const api = createApi()
    api.reservations.cancelReservation.mockRejectedValue(
      new AppError('RESERVATION_TRANSITION_FAILED'),
    )
    const store = createReservationStore(api)
    store.currentReservation.value = {
      id: 'reservation-1',
      propertyId: holdInput.propertyId,
      status: 'PENDING_PAYMENT',
      guestName: holdInput.guestName,
      guestEmail: holdInput.guestEmail,
      checkInDate: holdInput.checkInDate,
      checkOutDate: holdInput.checkOutDate,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }

    const result = await store.cancelReservation('reservation-1')

    expect(result).toBeNull()
    expect(store.currentReservation.value?.status).toBe('PENDING_PAYMENT')
    expect(store.errorCode.value).toBe('RESERVATION_TRANSITION_FAILED')
  })
})
