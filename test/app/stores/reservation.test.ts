import { describe, expect, it, vi } from 'vitest'

import { AppError } from '../../../app/api/errors'
import { createReservationStore } from '../../../app/stores/reservation'
import type { AvailabilityResponse } from '../../../shared/types/availability'
import type { CreateReservationHoldInput } from '../../../shared/types/reservation'
import type { ReservationDetails } from '../../../shared/types/reservation'

const input = {
  roomTypeId: 'room-1',
  checkInDate: '2026-08-10',
  checkOutDate: '2026-08-12',
  quantity: 1,
  guests: 2,
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
    price: {
      currency: 'TWD',
      nightlyPrice: 4200,
      subtotal: 8400,
      taxes: 0,
      discounts: 0,
      total: 8400,
    },
  }
}

function createApi() {
  return {
    availability: { getAvailability: vi.fn() },
    reservations: {
      getReservation: vi.fn(),
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
    store.availabilityErrorCode.value = 'AVAILABILITY_FAILED'

    store.clearAvailability()
    expect(signal.aborted).toBe(true)
    resolveRequest(availabilityResult(input.roomTypeId))
    await request

    expect(store.availabilityByRoomTypeId.value).toEqual({})
    expect(store.isAvailabilityLoading.value).toBe(false)
    expect(store.availabilityErrorCode.value).toBeNull()
  })

  it('keeps availability errors isolated from reservation resets', () => {
    const store = createReservationStore(createApi())
    store.availabilityErrorCode.value = 'AVAILABILITY_FAILED'

    store.clearReservation()

    expect(store.availabilityErrorCode.value).toBe('AVAILABILITY_FAILED')
  })

  it('stores AppError codes without exposing transport errors', async () => {
    const api = createApi()
    api.availability.getAvailability.mockRejectedValue(
      new AppError('AVAILABILITY_FAILED', { status: 500 }),
    )
    const store = createReservationStore(api)

    await store.searchAvailability(input)

    expect(store.availabilityErrorCode.value).toBe('AVAILABILITY_FAILED')
    expect(store.availabilityErrorDetails.value).toEqual({ status: 500 })
    expect(store.errorCode.value).toBeNull()
  })

  it('keeps compatible rooms when another room is unavailable for the guest count', async () => {
    const api = createApi()
    api.availability.getAvailability.mockImplementation(
      (request: typeof input) => {
        if (request.roomTypeId === 'room-1') {
          return Promise.resolve({
            ...availabilityResult(request.roomTypeId),
            available: false,
          })
        }
        return Promise.resolve(availabilityResult(request.roomTypeId))
      },
    )
    const store = createReservationStore(api)

    await store.searchAvailabilityForRooms([
      input,
      { ...input, roomTypeId: 'room-2' },
    ])

    expect(store.availabilityByRoomTypeId.value).toMatchObject({
      'room-1': { available: false },
      'room-2': availabilityResult('room-2'),
    })
    expect(
      Object.values(store.availabilityByRoomTypeId.value).filter(
        (result) => result.available,
      ),
    ).toHaveLength(1)
    expect(store.availabilityErrorCode.value).toBeNull()
  })

  it('fails the complete search when one room availability request rejects', async () => {
    const api = createApi()
    api.availability.getAvailability.mockImplementation(
      (request: typeof input) => {
        if (request.roomTypeId === 'room-1')
          return Promise.reject(new AppError('AVAILABILITY_FAILED'))
        return Promise.resolve(availabilityResult(request.roomTypeId))
      },
    )
    const store = createReservationStore(api)

    await store.searchAvailabilityForRooms([
      input,
      { ...input, roomTypeId: 'room-2' },
    ])

    expect(store.availabilityByRoomTypeId.value).toEqual({})
    expect(store.availabilityErrorCode.value).toBe('AVAILABILITY_FAILED')
  })

  it('replaces a failed multi-room search with complete results after retrying', async () => {
    const api = createApi()
    let shouldFail = true
    api.availability.getAvailability.mockImplementation(
      (request: typeof input) => {
        if (shouldFail && request.roomTypeId === 'room-1')
          return Promise.reject(new AppError('AVAILABILITY_FAILED'))
        return Promise.resolve(availabilityResult(request.roomTypeId))
      },
    )
    const store = createReservationStore(api)
    const inputs = [input, { ...input, roomTypeId: 'room-2' }]

    await store.searchAvailabilityForRooms(inputs)
    expect(store.availabilityErrorCode.value).toBe('AVAILABILITY_FAILED')

    shouldFail = false
    await store.searchAvailabilityForRooms(inputs)

    expect(store.availabilityErrorCode.value).toBeNull()
    expect(store.availabilityByRoomTypeId.value).toEqual({
      'room-1': availabilityResult('room-1'),
      'room-2': availabilityResult('room-2'),
    })
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
  it('updates the current reservation after confirming a hold', async () => {
    const api = createApi()
    api.reservations.confirmReservation.mockResolvedValue({
      id: 'reservation-1',
      propertyId: holdInput.propertyId,
      status: 'CONFIRMED',
      guestName: holdInput.guestName,
      guestEmail: holdInput.guestEmail,
      checkInDate: holdInput.checkInDate,
      checkOutDate: holdInput.checkOutDate,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    const store = createReservationStore(api)

    const result = await store.confirmReservation('reservation-1')

    expect(api.reservations.confirmReservation).toHaveBeenCalledWith(
      'reservation-1',
    )
    expect(result?.status).toBe('CONFIRMED')
    expect(store.currentReservation.value?.status).toBe('CONFIRMED')
  })

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

describe('reservation store lookup', () => {
  it('stores reservation details after a successful lookup', async () => {
    const api = createApi()
    const details = {
      id: 'reservation-1',
      status: 'CONFIRMED',
      items: [],
    } as unknown as ReservationDetails
    api.reservations.getReservation.mockResolvedValue(details)
    const store = createReservationStore(api)

    await expect(store.getReservation(details.id)).resolves.toEqual(details)

    expect(api.reservations.getReservation).toHaveBeenCalledWith(details.id)
    expect(store.reservationDetails.value).toEqual(details)
  })

  it('clears stale details and keeps the lookup error code', async () => {
    const api = createApi()
    api.reservations.getReservation.mockRejectedValue(
      new AppError('RESERVATION_NOT_FOUND'),
    )
    const store = createReservationStore(api)
    store.reservationDetails.value = {
      id: 'old-reservation',
      items: [],
    } as unknown as ReservationDetails

    await expect(store.getReservation('missing')).resolves.toBeNull()

    expect(store.reservationDetails.value).toBeNull()
    expect(store.lookupErrorCode.value).toBe('RESERVATION_NOT_FOUND')
    expect(store.errorCode.value).toBeNull()
  })
})
